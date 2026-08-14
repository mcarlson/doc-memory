// The read-side Retriever plugin contract. Defined here in the main package
// (not doc-memory-core) so a consumer can depend on `doc-memory` alone via a
// git tag — doc-memory-core lives in a subdir and isn't independently
// git-installable. Types-only; erased at runtime.
export {};
