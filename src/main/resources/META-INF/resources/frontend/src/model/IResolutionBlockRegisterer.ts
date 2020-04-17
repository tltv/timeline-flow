interface IResolutionBlockRegisterer {
  registerResolutionBlock(index: number, date: Date, currentYear: String, lastTimelineBlock: boolean): void;
}
