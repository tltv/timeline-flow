export class BlockRowData {

  blocks: Map<string, any> = new Map();
  blockLength: Map<string, number> = new Map();

  size(): number {
      return this.blocks.size;
  }

  getBlock(key: string): any {
      return this.blocks.get(key);
  }

  getBlockEntries(): IterableIterator<[string, any]> {
      return this.blocks.entries();
  }

  setBlock(key: string, element: any) {
      this.blocks.set(key, element);
  }

  getBlockLength(key: string): number {
      return this.blockLength.get(key);
  }

  setBlockLength(key: string, length: number) {
      this.blockLength.set(key, length);
  }

  clear() {
      this.blocks.clear();
      this.blockLength.clear();
  }
}
