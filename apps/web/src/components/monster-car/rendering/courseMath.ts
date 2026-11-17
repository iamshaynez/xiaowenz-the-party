export const COURSE_LENGTH = 108;

export interface CoursePoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

function rawCourse(progress: number) {
  const x = progress * COURSE_LENGTH;
  const climb = progress * 2.1;
  const rolling = Math.sin(x * 0.105) * 0.19 + Math.sin(x * 0.037 + 1) * 0.26;
  const z = Math.sin(x * 0.052) * 1.55 + Math.sin(x * 0.119 + 0.6) * 0.42;
  return { x, y: 0.25 + climb + rolling, z };
}

// 路面、车轮、障碍与相机共用同一个纯函数，避免视觉接地和比赛数据分离。
export function sampleCourse(progress: number): CoursePoint {
  const point = rawCourse(progress);
  const ahead = rawCourse(progress + 0.001);
  const behind = rawCourse(progress - 0.001);
  const dx = ahead.x - behind.x || 1;
  return {
    ...point,
    yaw: -Math.atan2(ahead.z - behind.z, dx),
    pitch: Math.atan2(ahead.y - behind.y, dx),
  };
}
