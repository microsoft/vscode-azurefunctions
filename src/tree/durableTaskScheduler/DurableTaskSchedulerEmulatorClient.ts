import { type Event, EventEmitter } from "vscode";
import { type DockerClient } from "./DockerClient";
import { Disposable } from "vscode";

export interface DurableTaskSchedulerEmulator {
    id: string;
    name: string;
}

export interface DurableTaskSchedulerEmulatorClient {
    readonly onEmulatorsChanged: Event<void>;

    getEmulators(): Promise<DurableTaskSchedulerEmulator[]>;
    startEmulator(): Promise<DurableTaskSchedulerEmulator>;
    stopEmulator(emulator: DurableTaskSchedulerEmulator): Promise<void>;
}

export class DockerDurableTaskSchedulerEmulatorClient extends Disposable implements DurableTaskSchedulerEmulatorClient {
    private readonly onEmulatorsChangedEmitter = new EventEmitter<void>();

    constructor(private readonly dockerClient: DockerClient) {
        super(
            () => {
                this.onEmulatorsChangedEmitter.dispose();
            });
    }

    get onEmulatorsChanged(): Event<void> { return this.onEmulatorsChangedEmitter.event; }

    async getEmulators(): Promise<DurableTaskSchedulerEmulator[]> {
        const containers = await this.dockerClient.getContainers();

        const emulatorContainers = containers.filter(container => container.image.toLowerCase().startsWith('durable-task-scheduler/emulator'));

        return emulatorContainers.map(container => ({
            id: container.id,
            name: container.name
        }));
    }

    startEmulator(): Promise<DurableTaskSchedulerEmulator> {
        return Promise.resolve({} as DurableTaskSchedulerEmulator);
    }

    stopEmulator(_: DurableTaskSchedulerEmulator): Promise<void> {
        return Promise.resolve();
    }
}
