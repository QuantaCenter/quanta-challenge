export const wait = (ms: number): Promise<void> => {
   return new Promise((resolve) => setTimeout(resolve, ms));
};

export const atLeastTime = async <T>(
   ms: number,
   promise: Promise<T>
): Promise<T> => {
   const [result] = await Promise.all([promise, wait(ms)]);
   return result;
};
