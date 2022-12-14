import { Firestore } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1";
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
import { JoinDependencyResource } from "./helper";
export declare class JoinFunctionBuilder {
    firestore: Firestore;
    constructor(firestore: Firestore);
    build<Data>(options: {
        regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null;
        runtimeOptions?: RuntimeOptions;
    } | null, triggerResource: string, targetResource: string, dependencies: JoinDependencyResource[], snapshotHandler: (snapshot: DocumentSnapshot<DocumentData>) => boolean, callback: (snapshot: DocumentSnapshot<DocumentData>) => Data): functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>>;
}
