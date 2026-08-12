import nimble from "@nimble-way/eve";

// Mount the Nimble extension. The mount directory name (`nimble/`) namespaces
// every contribution (e.g. the nimble__web-research skill). This example
// promotes search and extract into the built-in web_search/web_fetch slots and
// disables the namespaced duplicates — see the sibling tools/ files. The API
// key falls back to NIMBLE_API_KEY from the environment.
export default nimble({});
