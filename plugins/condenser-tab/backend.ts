let clickCount = 0;

export async function getCount() {
  return { count: clickCount };
}

export async function click() {
  return { count: ++clickCount };
}
