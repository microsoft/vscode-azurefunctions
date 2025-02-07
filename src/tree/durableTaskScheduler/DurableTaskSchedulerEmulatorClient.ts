import { Disposable, type Event, EventEmitter, Uri, workspace } from "vscode";
import { type ContainerClient } from "./ContainerClient";

export interface DurableTaskSchedulerEmulator {
    dashboardEndpoint: Uri;
    id: string;
    name: string;
    schedulerEndpoint: Uri;
    taskHubs: string[];
}

export interface DurableTaskSchedulerEmulatorClient {
    readonly onEmulatorsChanged: Event<void>;

    getEmulators(): Promise<DurableTaskSchedulerEmulator[]>;
    startEmulator(): Promise<string>;
    stopEmulator(id: string): Promise<void>;
}

interface ImageFullTag {
    registry: string;
    image: string;
    tag: string;
}

function getEmulatorFullTag(): ImageFullTag {
    const configuration = workspace.getConfiguration('azureFunctions');

    // NOTE: Defaults should be specified in package.json.
    const registry = configuration.get<string>('durableTaskScheduler.emulatorRegistry') as string;
    const image = configuration.get<string>('durableTaskScheduler.emulatorImage') as string;
    const tag = configuration.get<string>('durableTaskScheduler.emulatorTag') as string;

    return {
        registry,
        image,
        tag
    };
}

export class DockerDurableTaskSchedulerEmulatorClient extends Disposable implements DurableTaskSchedulerEmulatorClient {
    private readonly onEmulatorsChangedEmitter = new EventEmitter<void>();

    private localEmulatorIds = new Set<string>();

    constructor(private readonly dockerClient: ContainerClient) {
        super(
            () => {
                this.onEmulatorsChangedEmitter.dispose();
            });
    }

    readonly onEmulatorsChanged: Event<void> = this.onEmulatorsChangedEmitter.event;

    async disposeAsync(): Promise<void> {
        for (const id of this.localEmulatorIds) {
            await this.dockerClient.stopContainer(id);
            await this.dockerClient.removeContainer(id);
        }

        this.localEmulatorIds.clear();

        this.dispose();
    }

    async getEmulators(): Promise<DurableTaskSchedulerEmulator[]> {
        const { image } = getEmulatorFullTag();
        const containers = await this.dockerClient.getContainers();

        const emulatorContainers = containers.filter(container => container.image.toLowerCase() === image.toLowerCase());

        return emulatorContainers.map(container => ({
            dashboardEndpoint: Uri.parse(`http://localhost:${container.ports[8082]}`),
            id: container.id,
            name: container.name,
            schedulerEndpoint: Uri.parse(`http://localhost:${container.ports[8080]}`),
            taskHubs: ['default']
        }));
    }

    async startEmulator(): Promise<string> {
        try {
            const { registry, image, tag } = getEmulatorFullTag();
            const id = await this.dockerClient.runContainer(`${registry}/${image}:${tag}`);

            this.localEmulatorIds.add(id);

            return id;
        }
        finally {
            this.onEmulatorsChangedEmitter.fire();
        }
    }

    async stopEmulator(id: string): Promise<void> {
        try {
            await this.dockerClient.stopContainer(id);

            if (this.localEmulatorIds.has(id)) {
                await this.dockerClient.removeContainer(id);

                this.localEmulatorIds.delete(id);
            }
        }
        finally {
            this.onEmulatorsChangedEmitter.fire();
        }
    }
}
