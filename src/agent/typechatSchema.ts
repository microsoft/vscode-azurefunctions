export type AzureFunctionAction = {
    action: CreateFunctionAppAction | CreateFunctionProjectAction | DeployFunctionAppAction | UnknownAction;
};

export type CreateFunctionAppActionType = "createFunctionApp";
export type CreateFunctionAppAction = {
    actionType: CreateFunctionAppActionType;
    functionAppInfo: {
        name?: string;
        runtime?: "Node" | "Python" | "Java" | ".Net" | "PowerShell" | "Custom";
    }
};

export type CreateFunctionProjectActionType = "createFunctionProject";
export type CreateFunctionProjectAction = {
    actionType: CreateFunctionProjectActionType;
    projectInfo: {
        name?: string;
        language?: "JavaScript" | "Typescript" | "C#" | "Java" | "Python" | "Ballerina";
    }
};

export type DeployFunctionAppActionType = "deployFunctionApp";
export type DeployFunctionAppAction = {
    actionType: DeployFunctionAppActionType;
    functionAppInfo: {
        name?: string;
        slot?: "production" | "other";
    }
};

export type UnknownAction = {
    actionType: "unknown";
};
