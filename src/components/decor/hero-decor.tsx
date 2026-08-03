/**
 * Hero section decorative backgrounds — line-based, elegant, no large color blocks.
 * - Chinese: Infinity loop (∞) outline from logo
 * - English: Design A contour lines, lighter opacity
 *
 * Decor fades in slowly after the first breathing cycle completes.
 */

export function HeroDecorZh() {
  return (
    <svg
      className="hero-decor absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 375 500"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 主图：无限环(∞)线稿，居中偏上，逆时针旋转15度，适配竖屏 */}
      <g transform="translate(188, 170) scale(1.1) rotate(-15)" opacity="0.4">
        {/* 左瓣大轮廓 */}
        <path d="M -120,0 C -120,-45 -90,-65 -50,-65 C -10,-65 20,-45 20,0 C 20,45 -10,65 -50,65 C -90,65 -120,45 -120,0 Z" fill="none" stroke="#3482a2" strokeWidth="1.5" opacity="0.5" />
        {/* 左瓣内层1 */}
        <path d="M -105,0 C -105,-38 -80,-55 -50,-55 C -20,-55 5,-38 5,0 C 5,38 -20,55 -50,55 C -80,55 -105,38 -105,0 Z" fill="none" stroke="#3482a2" strokeWidth="1" opacity="0.35" />
        {/* 左瓣内层2 */}
        <path d="M -90,0 C -90,-30 -70,-45 -50,-45 C -30,-45 -10,-30 -10,0 C -10,30 -30,45 -50,45 C -70,45 -90,30 -90,0 Z" fill="none" stroke="#4aadd4" strokeWidth="0.8" opacity="0.25" />

        {/* 右瓣大轮廓 */}
        <path d="M 20,0 C 20,-50 50,-70 90,-70 C 120,-70 135,-50 135,0 C 135,50 120,70 90,70 C 50,70 20,50 20,0 Z" fill="none" stroke="#7ead78" strokeWidth="1.5" opacity="0.5" />
        {/* 右瓣内层1 */}
        <path d="M 35,0 C 35,-42 55,-60 90,-60 C 115,-60 125,-42 125,0 C 125,42 115,60 90,60 C 55,60 35,42 35,0 Z" fill="none" stroke="#7ead78" strokeWidth="1" opacity="0.35" />
        {/* 右瓣内层2 */}
        <path d="M 50,0 C 50,-34 60,-50 90,-50 C 108,-50 115,-34 115,0 C 115,34 108,50 90,50 C 60,50 50,34 50,0 Z" fill="none" stroke="#cdb293" strokeWidth="0.8" opacity="0.25" />

        {/* 中心交叉点 */}
        <ellipse cx="20" cy="0" rx="6" ry="3" fill="none" stroke="#3482a2" strokeWidth="0.6" opacity="0.3" />

        {/* 右瓣内四角星 */}
        <g transform="translate(90, 0)" opacity="0.4">
          <path d="M 0,-12 L 2.5,-2.5 L 12,0 L 2.5,2.5 L 0,12 L -2.5,2.5 L -12,0 L -2.5,-2.5 Z" fill="none" stroke="#7ead78" strokeWidth="0.8" />
        </g>

        {/* 向上点序列 */}
        <g opacity="0.3">
          <circle cx="-50" cy="-20" r="1.2" fill="#cdb293" />
          <circle cx="-50" cy="-35" r="1.2" fill="#cdb293" />
          <circle cx="-50" cy="-50" r="1" fill="#cdb293" opacity="0.7" />
          <circle cx="-50" cy="-65" r="0.8" fill="#cdb293" opacity="0.5" />
        </g>

        {/* 对角虚线 */}
        <line x1="-80" y1="30" x2="10" y2="-20" stroke="#3482a2" strokeWidth="0.5" opacity="0.2" strokeDasharray="4 3" />
      </g>

      {/* 顶部散落同心椭圆 */}
      <g transform="translate(55, 80) scale(0.25)" opacity="0.2">
        <ellipse cx="0" cy="0" rx="90" ry="70" fill="none" stroke="#3482a2" strokeWidth="1.5" />
        <ellipse cx="0" cy="0" rx="60" ry="46" fill="none" stroke="#4aadd4" strokeWidth="1" />
        <ellipse cx="0" cy="0" rx="30" ry="22" fill="none" stroke="#7ead78" strokeWidth="0.7" />
      </g>

      {/* 底部流动曲线 */}
      <g transform="translate(50, 430)" opacity="0.2">
        <path d="M 0,0 C 50,-10 100,5 150,-5 C 200,-15 250,0 280,-10" fill="none" stroke="#3482a2" strokeWidth="0.8" />
        <path d="M 0,12 C 50,2 100,17 150,7 C 200,-3 250,12 280,2" fill="none" stroke="#7ead78" strokeWidth="0.6" />
      </g>

      {/* 底部小四角星 */}
      <g transform="translate(325, 445) scale(0.5)" opacity="0.22">
        <path d="M 0,-12 L 2.5,-2.5 L 12,0 L 2.5,2.5 L 0,12 L -2.5,2.5 L -12,0 L -2.5,-2.5 Z" fill="none" stroke="#cdb293" strokeWidth="1" />
      </g>

      {/* 底部细线 */}
      <line x1="30" y1="475" x2="345" y2="475" stroke="#3482a2" strokeWidth="0.3" opacity="0.1" />
    </svg>
  );
}

export function HeroDecorEn() {
  return (
    <svg
      className="hero-decor absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 375 500"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 主图：极简四瓣轮廓，整体偏左居中偏上 */}
      <g transform="translate(95, 180)" opacity="0.35">
        {/* 主轮廓 */}
        <path d="M 0,-100 C 35,-75 55,-45 48,0 C 55,35 35,65 0,85 C -35,65 -55,35 -48,0 C -55,-45 -35,-75 0,-100 Z" fill="none" stroke="#3482a2" strokeWidth="1" opacity="0.6" />
        {/* 旋转45度 */}
        <path d="M 0,-100 C 35,-75 55,-45 48,0 C 55,35 35,65 0,85 C -35,65 -55,35 -48,0 C -55,-45 -35,-75 0,-100 Z" fill="none" stroke="#7ead78" strokeWidth="0.8" opacity="0.4" transform="rotate(45)" />
        {/* 旋转90度 */}
        <path d="M 0,-100 C 35,-75 55,-45 48,0 C 55,35 35,65 0,85 C -35,65 -55,35 -48,0 C -55,-45 -35,-75 0,-100 Z" fill="none" stroke="#cdb293" strokeWidth="0.8" opacity="0.35" transform="rotate(90)" />
        {/* 旋转135度 */}
        <path d="M 0,-100 C 35,-75 55,-45 48,0 C 55,35 35,65 0,85 C -35,65 -55,35 -48,0 C -55,-45 -35,-75 0,-100 Z" fill="none" stroke="#4aadd4" strokeWidth="0.8" opacity="0.3" transform="rotate(135)" />

        {/* 内部两条曲线 */}
        <path d="M -60,-30 C -30,-50 30,-50 60,-30" fill="none" stroke="#3482a2" strokeWidth="0.5" opacity="0.2" />
        <path d="M -60,30 C -30,50 30,50 60,30" fill="none" stroke="#7ead78" strokeWidth="0.5" opacity="0.2" />

        {/* 中心小圆 */}
        <circle cx="0" cy="0" r="3" fill="none" stroke="#3482a2" strokeWidth="0.8" opacity="0.3" />
      </g>

      {/* 右上：飘逸曲线 */}
      <g opacity="0.15">
        <path d="M 200,50 C 250,35 300,60 360,45" fill="none" stroke="#3482a2" strokeWidth="0.8" />
        <path d="M 200,62 C 250,50 300,72 360,58" fill="none" stroke="#4aadd4" strokeWidth="0.5" />
      </g>

      {/* 左下：飘逸曲线 */}
      <g opacity="0.15">
        <path d="M 20,420 C 70,405 120,425 180,410" fill="none" stroke="#7ead78" strokeWidth="0.8" />
        <path d="M 20,432 C 70,420 120,438 180,422" fill="none" stroke="#cdb293" strokeWidth="0.5" />
      </g>

      {/* 右下：极小四瓣 */}
      <g transform="translate(320, 400) scale(0.15)" opacity="0.18">
        <path d="M 0,-100 C 35,-75 55,-45 48,0 C 55,35 35,65 0,85 C -35,65 -55,35 -48,0 C -55,-45 -35,-75 0,-100 Z" fill="none" stroke="#3482a2" strokeWidth="3" />
        <path d="M 0,-100 C 35,-75 55,-45 48,0 C 55,35 35,65 0,85 C -35,65 -55,35 -48,0 C -55,-45 -35,-75 0,-100 Z" fill="none" stroke="#7ead78" strokeWidth="2" transform="rotate(45)" />
      </g>

      {/* 顶部点装饰 */}
      <circle cx="135" cy="30" r="1.5" fill="#3482a2" opacity="0.12" />
      <circle cx="150" cy="30" r="1" fill="#4aadd4" opacity="0.12" />
      <circle cx="165" cy="30" r="1.5" fill="#7ead78" opacity="0.12" />

      {/* 底部点装饰 */}
      <circle cx="135" cy="475" r="1.5" fill="#3482a2" opacity="0.1" />
      <circle cx="150" cy="475" r="1" fill="#7ead78" opacity="0.1" />
      <circle cx="165" cy="475" r="1.5" fill="#cdb293" opacity="0.1" />
    </svg>
  );
}
