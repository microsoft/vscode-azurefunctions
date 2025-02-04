import * as ContainerClient from '@microsoft/vscode-container-client';
import { localize } from '../../localize';

export interface DockerContainer {
    id: string;
    image: string;
    name: string;
    ports: { [key: number]: number };
}

export interface DockerClient {
    getContainers(): Promise<DockerContainer[]>;

    startContainer(image: string): Promise<string>;
    stopContainer(id: string): Promise<void>;
}

export class CliDockerClient implements DockerClient {
    async getContainers(): Promise<DockerContainer[]> {

        const dockerClient = new ContainerClient.DockerClient();
        const factory = new ContainerClient.ShellStreamCommandRunnerFactory({
        });

        const commandRunner = factory.getCommandRunner();

        const containers = await commandRunner(dockerClient.listContainers({}));

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

    async startContainer(image: string): Promise<string> {
        const dockerClient = new ContainerClient.DockerClient();
        const factory = new ContainerClient.ShellStreamCommandRunnerFactory({
        });

        const commandRunner = factory.getCommandRunner();

        const id = await commandRunner(dockerClient.runContainer({
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
        const dockerClient = new ContainerClient.DockerClient();
        const factory = new ContainerClient.ShellStreamCommandRunnerFactory({
        });

        const commandRunner = factory.getCommandRunner();

        await commandRunner(dockerClient.stopContainers({
            container: [id]
        }));
    }
}
