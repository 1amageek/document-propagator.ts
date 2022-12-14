import { Firestore } from "firebase-admin/firestore"
import * as functions from "firebase-functions"
import { EventContext, RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1"
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore"
import { JoinDependencyResource, getTargetPath, replaceDependencyData, encode } from "./helper"

export class JoinFunctionBuilder {

  firestore: Firestore

  constructor(firestore: Firestore) {
    this.firestore = firestore
  }

  build<Data>(
    options: {
      regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null,
      runtimeOptions?: RuntimeOptions 
    } | null,
    triggerResource: string,
    targetResource: string,
    dependencies: JoinDependencyResource[],
    snapshotHandler: (snapshot: DocumentSnapshot<DocumentData>) => boolean,
    callback: (snapshot: DocumentSnapshot<DocumentData>) => Data
  ): functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>> {
    let builder = options?.regions != null ? functions.region(...options.regions) : functions
    builder = !!options?.runtimeOptions ? builder.runWith(options.runtimeOptions) : builder
    return builder
      .firestore
      .document(triggerResource)
      .onWrite((change, context) => {
        const targetPath = getTargetPath(context.params, triggerResource, targetResource)
        if (!change.before.exists) {
          return onCreate(this.firestore, context, targetPath, change.after, dependencies, snapshotHandler, callback)
        } else if (change.after.exists) {
          return onUpdate(this.firestore, context, targetPath, change.after, dependencies, snapshotHandler, callback)
        }
        return null
      })
  }
}

const onCreate = async <Data>(
  firestore: Firestore,
  context: EventContext,
  targetPath: string,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  snapshotHandler: (snapshot: DocumentSnapshot<DocumentData>) => boolean,
  callback: (snapshot: DocumentSnapshot<DocumentData>
  ) => Data
) => {
  if (!snapshotHandler(snapshot)) {
    return
  }
  const data = snapshot.data()!
  const [dependence, results] = await replaceDependencyData(firestore, context, dependencies, data, callback)
  const documentData = encode({
    ...data,
    ...results,
    createTime: snapshot.updateTime!.toDate(),
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
  })
  return await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}

const onUpdate = async <Data>(
  firestore: Firestore,
  context: EventContext,
  targetPath: string,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  snapshotHandler: (snapshot: DocumentSnapshot<DocumentData>) => boolean,
  callback: (snapshot: DocumentSnapshot<DocumentData>
  ) => Data
) => {
  if (!snapshotHandler(snapshot)) {
    return
  }
  const data = snapshot.data()!
  const [dependence, results] = await replaceDependencyData(firestore, context, dependencies, data, callback)
  const documentData = encode({
    ...data,
    ...results,
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
  })
  return await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}
