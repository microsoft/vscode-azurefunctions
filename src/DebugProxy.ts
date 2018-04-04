/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { User } from 'azure-arm-website/lib/models';
import * as EventEmitter from 'events';
import { createServer, Server, Socket } from 'net';
import { OutputChannel } from 'vscode';
import { SiteClient } from 'vscode-azureappservice';
import * as websocket from 'websocket';

export class DebugProxy extends EventEmitter {
    private _server: Server | undefined;
    private _client: SiteClient;
    private _port: number;
    private _publishCredential: User;
    private _outputChannel: OutputChannel;

    constructor(outputChannel: OutputChannel, client: SiteClient, port: number, publishCredential: User) {
        super();
        this._client = client;
        this._port = port;
        this._publishCredential = publishCredential;
        this._outputChannel = outputChannel;
        this._server = createServer();
    }

    public async startProxy(): Promise<void> {

        if (!this._server) {
            this.emit('error', new Error('DebugProxy is not started.'));
        } else {
            // wake up the function app before connecting to it.
            //await this.keepAlive();

            this._server.on('connection', (socket: Socket) => {
                this._outputChannel.appendLine(`[DebugProxy] client connected ${socket.remoteAddress}:${socket.remotePort}`);
                this.createTunnelForSocket(socket);
            });

            this._server.on('listening', () => {
                this._outputChannel.appendLine('[DebugProxy] start listening');
                this.emit('start');
            });

            this._server.listen({
                host: 'localhost',
                port: this._port,
                backlog: 1
            });
        }
    }

    public dispose(): void {
        this._outputChannel.appendLine('[DebugProxy] dispose');
        if (this._server) {
            this._server.close();
        }
        this.emit('stop')
    }

    private async createTunnelForSocket(socket: Socket): Promise<void> {
        this._outputChannel.appendLine('[DebugProxy.createTunnelForSocket] init');

        let wsConnection: websocket.connection;
        const wsClient: websocket.client = new websocket.client();

        // Pause socket until tunnel connection has been established
        socket.pause();

        const dispose: () => void = (): void => {
            this._outputChannel.appendLine('[DebugProxy.createTunnelForSocket] dispose');

            if (wsConnection) {
                wsConnection.close();
            }

            if (wsClient) {
                wsClient.abort();
            }

            if (socket) {
                socket.destroy();
            }
        };

        socket.on('data', (data: Buffer) => {
            this._outputChannel.appendLine('[DebugProxy] socket data');
            if (wsConnection) {
                wsConnection.send(data);
            }
        });

        socket.on('end', () => {
            this._outputChannel.appendLine(`[DebugProxy] client disconnected ${socket.remoteAddress}:${socket.remotePort}`);
            this.emit('end');
            dispose();
        });

        socket.on('error', (err: Error) => {
            this.emit('error', err);
            this._outputChannel.appendLine(`[DebugProxy] socket error ${err}`);
            dispose();
        });

        wsClient.on('connect', (connection: websocket.connection) => {
            this._outputChannel.appendLine('[WebSocket] client connected');
            wsConnection = connection;

            // resune socket after connection to make sure we dont loose data
            socket.resume();

            connection.on('close', () => {
                this._outputChannel.appendLine('[WebSocket] client closed');
                this.emit('end');
                dispose();
            });

            connection.on('error', (err: Error) => {
                this._outputChannel.appendLine(`[WebSocket error] ${err}`);
                this.emit('error', err);
                dispose();
            });

            connection.on('message', (data: websocket.IMessage) => {
                this._outputChannel.appendLine('[WebSocket] data');
                socket.write(data.binaryData);
            });

        });

        wsClient.on('connectFailed', (err: Error) => {
            this._outputChannel.appendLine(`[WebSocket connectFailed] ${err}`);

            dispose();
            this.emit('error', err);
        });

        wsClient.connect(
            `wss://${this._client.kuduHostName}/AppServiceTunnel/Tunnel.ashx`,
            undefined,
            undefined,
            { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            { auth: `${this._publishCredential.publishingUserName}:${this._publishCredential.publishingPassword}` }
        );

    }

}
