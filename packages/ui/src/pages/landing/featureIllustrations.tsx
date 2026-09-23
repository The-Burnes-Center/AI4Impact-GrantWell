type Frag = [src: string, t: number, r: number, b: number, l: number];

const path = (name: string) => `/images/marketing/features/${name}.svg`;

function Composite({
  width,
  height,
  frags,
}: {
  width: number;
  height: number;
  frags: Frag[];
}) {
  return (
    <div
      className="marketing__illu"
      style={{ position: "relative", width, height, overflow: "hidden" }}
    >
      {frags.map(([src, t, r, b, l], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: `${t}%`,
            right: `${r}%`,
            bottom: `${b}%`,
            left: `${l}%`,
          }}
        >
          <img
            src={path(src)}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              maxWidth: "none",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function FeatureFind() {
  const frags: Frag[] = [
    ["f1", 47.61, 12.09, 4.19, 39.81],
    ["f2", 60.57, 22.3, 14.43, 52.74],
    ["f3", 58.13, 33.16, 0, 19.91],
    ["f4", 68.03, 43.45, 8.59, 32.41],
    ["f5", 39.42, 51.49, 13.18, 0],
    ["f6", 51.85, 64.85, 23.18, 10.37],
    ["f7", 23.27, 62.26, 37.28, 7.47],
    ["f8", 32.23, 67.99, 46.24, 13.38],
    ["f9", 0, 35.62, 52.04, 16.09],
    ["f10", 10.16, 48.71, 64.82, 26.37],
    ["f11", 7.34, 28.35, 57.42, 28.74],
    ["f12", 14.38, 37.95, 64.84, 39.72],
    ["f13", 15.73, 1.16, 42.61, 52.03],
    ["f14", 24.27, 11.43, 52.42, 65.79],
    ["f15", 31, 0, 23.68, 61.22],
    ["f16", 41.03, 7.86, 35.27, 69.94],
    ["f17", 43.99, 3.72, 7.52, 50.78],
    ["f18", 57.79, 13.22, 18, 62.24],
    ["f19", 40.07, 24.65, 18.32, 28.55],
    ["f20", 49.86, 38.4, 26.85, 38.82],
    ["f21", 18.25, 39.28, 33.25, 15.18],
    ["f22", 31.95, 50.76, 43.73, 24.68],
    ["f23", 20.46, 29.88, 39.03, 23.92],
    ["f24", 28.73, 41.96, 48.39, 34.09],
    ["f25", 17.73, 1.31, 2.97, 19.54],
    ["f26", 27.89, 24.67, 26.38, 29.68],
    ["f27", 32.68, 33.7, 31.14, 38.51],
    ["f28", 40.87, 38.94, 39.33, 43.91],
  ];
  return <Composite width={200} height={200} frags={frags} />;
}

export function FeatureSummarize() {
  const frags: Frag[] = [
    ["s1", 17.35, 52.67, 0, 10.12],
    ["s2", 11.4, 56.18, 5.95, 6.62],
    ["s3", 5.46, 59.52, 11.89, 3.28],
    ["s4", 0, 62.8, 17.35, 0],
    ["s5", 18.66, 69.74, 36, 7.17],
    ["s6", 0, 0, 0.18, 56.81],
    ["s7", 39.76, 39.57, 39.97, 43.28],
    ["s8", 11.44, 6.5, 66.21, 63.21],
    ["s9", 38.74, 6.5, 38.92, 63.21],
    ["s9", 66.03, 6.5, 11.62, 63.21],
    ["s11", 17.95, 9.99, 17.69, 66.93],
  ];
  return <Composite width={306} height={180} frags={frags} />;
}

export function AiForImpactWordmark() {
  const ai = (name: string) => `/images/marketing/ai4impact/${name}.svg`;
  type V = [src: string, t: number, r: number, b: number, l: number];
  const vectors: V[] = [
    ["v0", 72.43, 96.64, 0.41, 0],
    ["v1", 72.43, 72.47, 0.41, 8.58],
    ["v2", 72.43, 53.63, 0.41, 32.75],
    ["v3", 72.43, 35.5, 0.41, 46.69],
    ["v4", 72.02, 16.97, 0, 66.1],
    ["v5", 72.43, 0, 0.41, 85.41],
    ["v6", 0, 81.97, 72.84, 0.22],
    ["v7", 0, 74.76, 72.84, 21.88],
    ["v8", 36.33, 87.3, 36.51, 0.23],
    ["v9", 35.91, 66.88, 36.1, 14.77],
    ["v10", 36.32, 48.99, 36.52, 36.68],
  ];
  return (
    <div
      style={{ position: "relative", width: 71, height: 50, flexShrink: 0 }}
    >
      {vectors.map(([src, t, r, b, l], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: `${t}%`,
            right: `${r}%`,
            bottom: `${b}%`,
            left: `${l}%`,
          }}
        >
          <img
            src={ai(src)}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              maxWidth: "none",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function FeatureWrite() {
  const frags: Frag[] = [
    ["w1", 17.77, 12.91, 0, 18.68],
    ["w2", 11.84, 19.37, 5.93, 12.21],
    ["w3", 5.91, 25.53, 11.86, 6.06],
    ["w4", 0.47, 31.58, 17.3, 0],
    ["w5", 9.8, 39.78, 72.64, 8.19],
    ["w6", 14.79, 45.84, 77.29, 14.65],
    ["w7", 32.81, 39.78, 49.64, 8.19],
    ["w8", 37.79, 48.61, 54.28, 14.65],
    ["w9", 55.81, 39.78, 26.64, 8.19],
    ["w10", 0, 0, 59.83, 56.3],
  ];
  return <Composite width={165} height={180} frags={frags} />;
}
