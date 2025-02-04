import { type Event, EventEmitter, Uri } from "vscode";
import { type DockerClient } from "./DockerClient";
import { Disposable } from "vscode";

export interface DurableTaskSchedulerEmulator {
    dashboardEndpoint: Uri;
    id: string;
    name: string;
    schedulerEndpoint: Uri;
}

export interface DurableTaskSchedulerEmulatorClient {
    readonly onEmulatorsChanged: Event<void>;

    getEmulators(): Promise<DurableTaskSchedulerEmulator[]>;
    startEmulator(): Promise<string>;
    stopEmulator(id: string): Promise<void>;
}

export class DockerDurableTaskSchedulerEmulatorClient extends Disposable implements DurableTaskSchedulerEmulatorClient {
    private readonly onEmulatorsChangedEmitter = new EventEmitter<void>();

    constructor(private readonly dockerClient: DockerClient) {
        super(
            () => {
                this.onEmulatorsChangedEmitter.dispose();
            });
    }

    readonly onEmulatorsChanged: Event<void> = this.onEmulatorsChangedEmitter.event;

    async getEmulators(): Promise<DurableTaskSchedulerEmulator[]> {
        const containers = await this.dockerClient.getContainers();

        const emulatorContainers = containers.filter(container => container.image.toLowerCase().startsWith('durable-task-scheduler/emulator'));

        return emulatorContainers.map(container => ({
            dashboardEndpoint: Uri.parse(`http://localhost:${container.ports[8082]}`),
            id: container.id,
            name: container.name,
            schedulerEndpoint: Uri.parse(`http://localhost:${container.ports[8080]}`)
        }));
    }

    async startEmulator(): Promise<string> {
        try {
            const id = await this.dockerClient.startContainer('durabletasks.azurecr.io/durable-task-scheduler/emulator:latest-linux-arm64');

            return id;
        }
        finally {
            this.onEmulatorsChangedEmitter.fire();
        }
    }

    async stopEmulator(id: string): Promise<void> {
        try {
            await this.dockerClient.stopContainer(id);
        }
        finally {
            this.onEmulatorsChangedEmitter.fire();
        }
    }
}
