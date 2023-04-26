import { EventContext } from "firebase-functions/v1";

export type Context = {
  event: EventContext,
  targetPath: string,
  groupValue: string | null
}

export type CollectionReferenceResource = string

export type DocumentReferencePath = string

export type Field = string

export type Data = { [key: string]: any }
