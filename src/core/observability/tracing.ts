export class Tracer {
  async span<T>(name: string, fn: () => Promise<T>): Promise<T> {
    // MVP no-op. Later: OpenTelemetry span.
    void name;
    return fn();
  }
}
