import { UzuRoot } from "@/components/uzu/root"
import { ErrorBoundary } from "@/components/uzu/error-boundary"

export default function Page() {
  return <ErrorBoundary><UzuRoot /></ErrorBoundary>
}
