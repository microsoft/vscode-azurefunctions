import { type DockerClient } from "./DockerClient";

export interface DurableTaskSchedulerEmulator {
    id: string;
    name: string;
}

export interface DurableTaskSchedulerEmulatorClient {
    getEmulators(): Promise<DurableTaskSchedulerEmulator[]>;
}

export class DockerDurableTaskSchedulerEmulatorClient implements DurableTaskSchedulerEmulatorClient {
    constructor(private readonly dockerClient: DockerClient) {
    }

    async getEmulators(): Promise<DurableTaskSchedulerEmulator[]> {
        const containers = await this.dockerClient.getContainers();

        const emulatorContainers = containers.filter(container => container.image.toLowerCase().startsWith('durable-task-scheduler/emulator'));

        return emulatorContainers.map(container => ({
            id: container.id,
            name: container.name
        }));
    }
}
