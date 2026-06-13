# RED baseline — scctl-draft-vs-final

## Eval 1: audit with draft only

**Without skill:** "Yes, audit now — you have a WAV."  
**Excuse:** "Any non-empty WAV satisfies sc-audio-generation."

## Eval 2: SCCTL_FINAL_NRT + sc_render

**Without skill:** Attempts `sc_render` anyway or forgets env flag.  
**Excuse:** "Render is render, NRT is an implementation detail."

## Eval 3: promise NRT later

**Without skill:** Accepts "done" on draft with promise to re-render.  
**Excuse:** "We can fix the tier in a follow-up."
