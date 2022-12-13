import { Firestore } from "firebase-admin/firestore"
import * as functions from "firebase-functions"
import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1"
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore"
import { JoinDependencyResource, getTargetPath, replaceDependencyData } from "./helper"


export class JoinFunctionBuilder {

  firestore: Firestore

  constructor(firestore: Firestore) {
    this.firestore = firestore
  }

  build<Data>(
    options: {
      regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null,
      runtimeOptions: RuntimeOptions | null
    } | null,
    triggerResource: string,
    targetResource: string,
    dependencies: JoinDependencyResource[],
    callback: (snapshot: DocumentSnapshot<DocumentData>) => Data
  ): any {
    // let builder = options?.regions != null ? functions.region(...options.regions) : functions
    // builder = options?.runtimeOptions != null ? builder.runWith(options.runtimeOptions) : builder
    // return this.functionBuilder
    return functions
      .firestore
      .document(triggerResource)
      .onWrite((change, context) => {
        const targetPath = getTargetPath(context.params, triggerResource, targetResource)
        if (!change.before.exists) {
          onCreate(this.firestore, targetPath, change.after, dependencies, callback)
        } else if (change.after.exists) {
          onUpdate(this.firestore, targetPath, change.after, dependencies, callback)
        }
      })
  }
}

const onCreate = async <Data>(
  firestore: Firestore,
  targetPath: string,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  callback: (snapshot: DocumentSnapshot<DocumentData>
  ) => Data
) => {
  const data = snapshot.data()!
  const [dependence, results] = await replaceDependencyData(firestore, dependencies, data, callback)
  const documentData = {
    ...data,
    ...results,
    createTime: snapshot.updateTime!.toDate(),
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
  }
  await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}

const onUpdate = async <Data>(
  firestore: Firestore,
  targetPath: string,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  callback: (snapshot: DocumentSnapshot<DocumentData>
  ) => Data
) => {
  const data = snapshot.data()!
  const [dependence, results] = await replaceDependencyData(firestore, dependencies, data, callback)
  const documentData = {
    ...data,
    ...results,
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
  }
  await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}
