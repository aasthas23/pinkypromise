import { renderHook } from "@testing-library/react";

import { useDemo } from "@/lib/store";

/** Current demo state, read through the public hook. */
export const getDemo = () => renderHook(() => useDemo()).result.current;
