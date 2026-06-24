export class Metrics {
  increment(name: string, labels: Record<string, string> = {}): void {
    // MVP no-op. Later: Prometheus counter.
    void name;
    void labels;
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    // MVP no-op. Later: Prometheus histogram.
    void name;
    void value;
    void labels;
  }
}
