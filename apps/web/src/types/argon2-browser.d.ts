declare module 'argon2-browser' {
  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2,
  }

  export interface HashParams {
    pass: string | Uint8Array;
    salt: string | Uint8Array;
    time?: number;
    mem?: number;
    hashLen?: number;
    parallelism?: number;
    type?: ArgonType;
  }

  export interface HashResult {
    hash: Uint8Array;
    encoded: string;
    hex: string;
  }

  export function hash(params: HashParams): Promise<HashResult>;
  export default {
    hash,
    ArgonType,
  };
}

declare module 'argon2-browser/dist/argon2-bundled.min.js' {
  import argon2 from 'argon2-browser';
  export = argon2;
}
