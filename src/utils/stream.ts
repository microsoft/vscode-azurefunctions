export type AsyncStreamHandler = {
    stream: AsyncIterable<string>;
    write: (chunk: string) => void;
    end: () => void;
    done: boolean;
};

export function createAsyncStringStream(): AsyncStreamHandler {
    const queue: (string | null)[] = [];
    let resolveNext: ((result: IteratorResult<string>) => void) | null = null;
    let done = false;

    const stream: AsyncIterable<string> = {
        [Symbol.asyncIterator](): AsyncIterator<string> {
            return {
                next() {
                    return new Promise<IteratorResult<string>>(resolve => {
                        if (queue.length > 0) {
                            const value = queue.shift();
                            if (value === null) {
                                resolve({ value: undefined, done: true });
                            } else {
                                resolve({ value: value as string, done: false });
                            }
                        } else if (done) {
                            resolve({ value: undefined, done: true });
                        } else {
                            resolveNext = resolve;
                        }
                    });
                }
            };
        }
    };

    function write(chunk: string) {
        if (done) throw new Error("Cannot write to a ended stream");
        if (resolveNext) {
            resolveNext({ value: chunk, done: false });
            resolveNext = null;
        } else {
            queue.push(chunk);
        }
    }

    function end() {
        done = true;
        if (resolveNext) {
            resolveNext({ value: undefined, done: true });
            resolveNext = null;
        } else {
            queue.push(null); // sentinel for end
        }
    }

    return { stream, write, end, done };
}
