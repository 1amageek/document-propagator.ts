import { EventContext } from "firebase-functions/v1";

export type Context = {
  event: EventContext,
  targetPath: string,
  groupValue: string | null
}
