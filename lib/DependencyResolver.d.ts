import { Firestore } from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1";
import { DependencyResource } from "./helper";
export declare class PropagateFunctionBuilder {
    firestore: Firestore;
    constructor(firestore: Firestore);
    build(options: {
        regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null;
        runtimeOptions: RuntimeOptions | null;
    } | null, triggerResource: string, dependencyTargetResources: DependencyResource[]): functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>>;
}
