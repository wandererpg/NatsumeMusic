declare module 'howler' {
  export interface HowlOptions {
    src: string[];
    html5?: boolean;
    format?: string[];
    volume?: number;
    onload?: () => void;
    onplay?: (id?: number) => void;
    onpause?: (id?: number) => void;
    onend?: (id?: number) => void;
    onloaderror?: (id: number, error: unknown) => void;
    onplayerror?: (id: number, error: unknown) => void;
  }

  export class Howl {
    constructor(options: HowlOptions);
    play(id?: number): number;
    pause(id?: number): this;
    stop(id?: number): this;
    seek(): number | number[];
    seek(position: number, id?: number): this;
    volume(): number;
    volume(value: number, id?: number): this;
    duration(id?: number): number;
    playing(id?: number): boolean;
    unload(): void;
  }
}
