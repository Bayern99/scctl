import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const { mockDiscoverSclangPath, MockSclangController } = vi.hoisted(() => {
  const mockDiscoverSclangPath = vi.fn();
  class MockSclangController {
    static instances: MockSclangController[] = [];
    path: string;
    
    constructor(path: string) {
      this.path = path;
      MockSclangController.instances.push(this);
    }

    async boot(): Promise<void> {}
    async execute(code: string): Promise<{ success: boolean; output: string }> {
      return { success: true, output: 'mocked output' };
    }
    async stop(): Promise<void> {}
  }
  return { mockDiscoverSclangPath, MockSclangController };
});

vi.mock('../../src/runtime/discover.js', () => ({
  discoverSclangPath: mockDiscoverSclangPath,
}));

vi.mock('../../src/runtime/sclang.js', () => ({
  SclangController: MockSclangController,
}));

// Now import server and helpers
import { server, getActiveController, setActiveController, startMcpServer } from '../../src/mcp/server.js';

describe('MCP Server Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDiscoverSclangPath.mockReset();
    MockSclangController.instances = [];
    setActiveController(null);
    
    // Set default prototype spied implementations
    vi.spyOn(MockSclangController.prototype, 'boot').mockResolvedValue(undefined);
    vi.spyOn(MockSclangController.prototype, 'execute').mockResolvedValue({ success: true, output: 'mocked output' });
    vi.spyOn(MockSclangController.prototype, 'stop').mockResolvedValue(undefined);
  });

  it('should instantiate server with tools capability', () => {
    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(Server);
  });

  it('should return the correct tool schemas on tools/list', async () => {
    const listToolsHandler = (server as any)._requestHandlers.get('tools/list');
    expect(listToolsHandler).toBeDefined();

    const result = await listToolsHandler({ method: 'tools/list' }, { signal: new AbortController().signal });
    expect(result).toBeDefined();
    expect(result.tools).toHaveLength(3);

    const checkTool = result.tools.find((t: any) => t.name === 'sc_check');
    expect(checkTool).toBeDefined();
    expect(checkTool.inputSchema).toEqual({ type: 'object', properties: {} });

    const evalTool = result.tools.find((t: any) => t.name === 'sc_eval');
    expect(evalTool).toBeDefined();
    expect(evalTool.inputSchema.properties.code).toBeDefined();
    expect(evalTool.inputSchema.required).toContain('code');

    const stopTool = result.tools.find((t: any) => t.name === 'sc_stop');
    expect(stopTool).toBeDefined();
  });

  describe('sc_check tool', () => {
    it('should return found message when sclang is available', async () => {
      mockDiscoverSclangPath.mockReturnValue('/mock/path/sclang');
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');
      
      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_check' }
      }, { signal: new AbortController().signal });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('/mock/path/sclang');
    });

    it('should return error when sclang is not found', async () => {
      mockDiscoverSclangPath.mockReturnValue(null);
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');
      
      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_check' }
      }, { signal: new AbortController().signal });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('sc_eval tool', () => {
    it('should return error if code is missing', async () => {
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');
      
      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: {} }
      }, { signal: new AbortController().signal });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Missing required argument');
    });

    it('should lazily boot controller on first eval and execute code', async () => {
      mockDiscoverSclangPath.mockReturnValue('/mock/path/sclang');
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');
      
      expect(getActiveController()).toBeNull();

      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: '1 + 1' } }
      }, { signal: new AbortController().signal });

      const controller = getActiveController() as any;
      expect(controller).not.toBeNull();
      expect(controller.boot).toHaveBeenCalled();
      expect(controller.execute).toHaveBeenCalledWith('1 + 1');
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('mocked output');
    });

    it('should reuse existing active controller on subsequent evals', async () => {
      mockDiscoverSclangPath.mockReturnValue('/mock/path/sclang');
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');
      
      // First eval
      await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: '1 + 1' } }
      }, { signal: new AbortController().signal });

      const firstController = getActiveController();

      // Second eval
      await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: '2 + 2' } }
      }, { signal: new AbortController().signal });

      expect(getActiveController()).toBe(firstController);
      expect((firstController as any).boot).toHaveBeenCalledTimes(1);
      expect((firstController as any).execute).toHaveBeenCalledTimes(2);
    });

    it('should return error output and set isError when execution fails', async () => {
      mockDiscoverSclangPath.mockReturnValue('/mock/path/sclang');
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');

      // First eval
      await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: '1 + 1' } }
      }, { signal: new AbortController().signal });

      const controller = getActiveController() as any;
      vi.spyOn(controller, 'execute').mockResolvedValue({ success: false, output: 'execution error details' });

      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: 'bad code' } }
      }, { signal: new AbortController().signal });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('execution error details');
    });

    it('should handle boot failure, stop/clean up controller, and return error', async () => {
      mockDiscoverSclangPath.mockReturnValue('/mock/path/sclang');
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');

      // Simulate boot rejection
      const bootError = new Error('Spawn failed');
      vi.spyOn(MockSclangController.prototype, 'boot').mockRejectedValue(bootError);

      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: '1 + 1' } }
      }, { signal: new AbortController().signal });

      expect(getActiveController()).toBeNull();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Execution failed: Spawn failed');
    });
  });

  describe('sc_stop tool', () => {
    it('should stop the active controller and set to null', async () => {
      mockDiscoverSclangPath.mockReturnValue('/mock/path/sclang');
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');

      // Start one first
      await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: '1 + 1' } }
      }, { signal: new AbortController().signal });

      const controller = getActiveController() as any;
      expect(controller).not.toBeNull();

      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_stop' }
      }, { signal: new AbortController().signal });

      expect(controller.stop).toHaveBeenCalled();
      expect(getActiveController()).toBeNull();
      expect(result.content[0].text).toContain('stopped successfully');
    });

    it('should return no active controller running if not running', async () => {
      const callToolHandler = (server as any)._requestHandlers.get('tools/call');

      const result = await callToolHandler({
        method: 'tools/call',
        params: { name: 'sc_stop' }
      }, { signal: new AbortController().signal });

      expect(result.content[0].text).toContain('No active sclang controller');
    });
  });

  it('should expose startMcpServer function', () => {
    expect(typeof startMcpServer).toBe('function');
  });
});
