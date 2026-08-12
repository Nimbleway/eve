import { disableTool } from "eve/tools";

// This agent promotes Nimble search to the built-in web_search slot
// (see agent/tools/web_search.ts), so the namespaced nimble__search would be a
// duplicate of the same tool. Disable it in the mount's override slot.
export default disableTool();
