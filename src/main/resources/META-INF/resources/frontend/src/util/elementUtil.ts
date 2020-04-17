export function getWidth(element: HTMLElement): number {
  if (!element) {
    return 0.0;
  }
  if (element.getBoundingClientRect()) {
    let rect = element.getBoundingClientRect();
    return rect.right - rect.left;
  } else {
    return element.offsetWidth;
  }
}

export function getRight(element: HTMLElement): number {
  if (!element) {
    return 0.0;
  }
  if (element.getBoundingClientRect()) {
    var rect = element.getBoundingClientRect();
    return rect.right;
  } else {
    return element.offsetLeft + element.offsetWidth;
  }
}

export function getLeft(element: HTMLElement): number {
  if (!element) {
    return 0.0;
  }
  if (element.getBoundingClientRect()) {
    var rect = element.getBoundingClientRect();
    return rect.left;
  } else {
    return element.offsetLeft;
  }
}
