import * as CodeContainerClient from '@microsoft/vscode-container-client';
import { localize } from '../../localize';

export interface DockerContainer {
    id: string;
    image: string;
    name: string;
    ports: { [key: number]: number };
}

export interface ContainerClient {
    getContainers(): Promise<DockerContainer[]>;

    removeContainer(id: string): Promise<void>;

    runContainer(image: string): Promise<string>;

    stopContainer(id: string): Promise<void>;
}

export class ShellContainerClient implements ContainerClient {
    private readonly dockerClient = new CodeContainerClient.DockerClient();
    private readonly factory = new CodeContainerClient.ShellStreamCommandRunnerFactory({});

    async getContainers(): Promise<DockerContainer[]> {
        const commandRunner = this.factory.getCommandRunner();

        const containers = await commandRunner(this.dockerClient.listContainers({ running: true }));

        return containers.map(
            container =>
            ({
                id: container.id,
                image: container.image.image as string,
                name: container.name,
                ports: container.ports.reduce(
                    (previous, port) => {
                        previous[port.containerPort] = port.hostPort;

                        return previous;
                    },
                    {})
            }));
    }

    async removeContainer(id: string): Promise<void> {
        const commandRunner = this.factory.getCommandRunner();

        await commandRunner(this.dockerClient.removeContainers({
            containers: [id]
        }));
    }

    async runContainer(image: string): Promise<string> {
        const commandRunner = this.factory.getCommandRunner();

        const id = await commandRunner(this.dockerClient.runContainer({
            detached: true,
            imageRef: image,
            publishAllPorts: true
        }));

        if (!id) {
            throw new Error(localize('startContainerFailed', 'Unable to start the container.'));
        }

        return id;
    }

    async stopContainer(id: string): Promise<void> {
        const commandRunner = this.factory.getCommandRunner();

        await commandRunner(this.dockerClient.stopContainers({
            container: [id]
        }));
    }
}
