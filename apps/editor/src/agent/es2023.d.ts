/** The ES2023 array methods the runtime uses (the editor's tsconfig targets ES2022 libs; every browser the editor supports has them). */
interface Array<T> {
  findLastIndex(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): number;
}
