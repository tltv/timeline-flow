interface IResolutionBlockFiller {
  fillResolutionBlock(index: number, date: Date, currentYear: String, lastTimelineBlock: boolean): void;

  setup(): void;
}
