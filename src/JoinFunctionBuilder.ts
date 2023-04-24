import { Firestore } from "firebase-admin/firestore"
import * as functions from "firebase-functions"
import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1"
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore"
import { JoinDependencyResource, getTargetPath, replaceDependencyData, encode, JoinQuery, getPath } from "./helper"
import { Context } from "./Interface"
import { v4 as uuidv4 } from 'uuid'

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
    query: JoinQuery,
    snapshotHandler: (context: Context, snapshot: DocumentSnapshot<DocumentData>) => boolean,
    callback: (context: Context, snapshot: DocumentSnapshot<DocumentData>) => Data
  ): functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>> {
    let builder = options?.regions != null ? functions.region(...options.regions) : functions
    builder = !!options?.runtimeOptions ? builder.runWith(options.runtimeOptions) : builder
    const triggerResource = query.from
    return builder
      .firestore
      .document(triggerResource)
      .onWrite((change, context) => {
        const group = query.group
        if (!group) {
          const targetResource = query.to
          const dependencies = query.resources
          const targetPath = getTargetPath(context.params, triggerResource, targetResource)
          const _context: Context = { event: context, targetPath, groupValue: null }
          if (change.before.exists) {
            if (change.after.exists) {
              return onUpdate(this.firestore, _context, change.after, dependencies, snapshotHandler, callback)
            } else {
              return onDelete(this.firestore, _context, change.before, snapshotHandler)
            }
          } else {
            return onCreate(this.firestore, _context, change.after, dependencies, snapshotHandler, callback)
          }
        }
        const tasks = group.values.map(async (value) => {
          const dependencies = query.resources.map(resource => {
            const _resource = getPath(resource.resource, { [group.documentID]: value })
            return { ...resource, resource: _resource }
          })
          const path = getTargetPath(context.params, triggerResource, query.to)
          const targetPath = getPath(path, { [group.documentID]: value })
          const _context: Context = { event: context, targetPath, groupValue: value }
          if (change.before.exists) {
            if (change.after.exists) {
              return onUpdate(this.firestore, _context, change.after, dependencies, snapshotHandler, callback)
            } else {
              return onDelete(this.firestore, _context, change.before, snapshotHandler)
            }
          } else {
            return onCreate(this.firestore, _context, change.after, dependencies, snapshotHandler, callback)
          }
        })
        return Promise.all(tasks)
      })
  }
}

const onCreate = async <Data>(
  firestore: Firestore,
  context: Context,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  snapshotHandler: (context: Context, snapshot: DocumentSnapshot<DocumentData>) => boolean,
  callback: (context: Context, snapshot: DocumentSnapshot<DocumentData>) => Data
) => {
  if (!snapshotHandler(context ,snapshot)) {
    return
  }
  const data = snapshot.data()!
  const targetPath = context.targetPath
  const [dependence, results] = await replaceDependencyData(firestore, context, dependencies, data, callback)
  const documentData = encode({
    ...data,
    ...results,
    createTime: snapshot.updateTime!.toDate(),
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
    __propageteID: uuidv4()
  })
  return await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}

const onUpdate = async <Data>(
  firestore: Firestore,
  context: Context,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  snapshotHandler: (context: Context, snapshot: DocumentSnapshot<DocumentData>) => boolean,
  callback: (context: Context, snapshot: DocumentSnapshot<DocumentData>) => Data
) => {
  if (!snapshotHandler(context, snapshot)) {
    return
  }
  const data = snapshot.data()!
  const targetPath = context.targetPath
  const [dependence, results] = await replaceDependencyData(firestore, context, dependencies, data, callback)
  const documentData = encode({
    ...data,
    ...results,
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
    __propageteID: uuidv4()
  })
  return await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}

const onDelete = async (
  firestore: Firestore,
  context: Context,
  snapshot: DocumentSnapshot,
  snapshotHandler: (context: Context, snapshot: DocumentSnapshot<DocumentData>) => boolean,
) => {
  if (!snapshotHandler(context, snapshot)) {
    return
  }
  const targetPath = context.targetPath
  return await firestore
    .doc(targetPath)
    .delete()
}
