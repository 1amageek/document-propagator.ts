import { ParamsOf } from "firebase-functions/v2";
import { FirestoreEvent, Change, DocumentSnapshot } from "firebase-functions/v2/firestore";

export interface Context<Document extends string> {
  event: FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>;
  triggerResource: string;
  targetPath: string;
  groupValue: string | null;
}

export type CollectionReferenceResource = string

export type DocumentReferencePath = string

export type Field = string

export type Data = { [key: string]: any }
