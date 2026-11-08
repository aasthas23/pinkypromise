import { Redirect } from 'expo-router';

/** The simulator is the only module so far, so the app opens straight into it. */
export default function Index() {
  return <Redirect href="/simulator" />;
}
