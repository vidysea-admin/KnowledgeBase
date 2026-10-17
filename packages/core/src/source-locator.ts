/** Exact offsets use UTF-16 code units in the current canonical page/message text.
 * sha256 hashes the UTF-8 bytes of that exact slice. These fields are references,
 * never authorization: consumers reload current tenant/source/head authority. */
export interface NativePassageLocator {
  start: number;
  end: number;
  sha256: string;
}

export interface DocumentPageSourceLocator {
  kind: 'document-page';
  documentId: string;
  /** Stable canonical sources._id, distinct from the immutable document source ID. */
  sourceId: string;
  documentSourceId: string;
  headRevision: number;
  revisionHash: string;
  pageNumber: number;
  passage: NativePassageLocator;
}

export interface MessageSourceLocator {
  kind: 'message';
  sourceId: string;
  revisionHash: string;
  threadId: string;
  messageId: string;
  passage: NativePassageLocator;
}

export type NativeSourceLocator = DocumentPageSourceLocator | MessageSourceLocator;
export type SourceLocator = NativeSourceLocator | { kind: 'transcript'; sessionId: string; turnId: string };
