import { Composition } from 'remotion'
import { InfographicScene } from './InfographicScene'
import { TitleScene } from './TitleScene'

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Infographic"
        component={InfographicScene}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          keyword: '분야별 성장률',
          bullets: ['생성형 AI: +67.2%', '자연어처리: +41.8%', '컴퓨터 비전: +29.3%'],
        }}
      />
      <Composition
        id="Title"
        component={TitleScene}
        durationInFrames={240}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          keyword: '글로벌 AI 시장 184조 원 돌파',
          design: 'gradient-box',
          palette: { bar: '#3B82F6', barEnd: '#8B5CF6', underline: '#FBBF24' },
        }}
      />
    </>
  )
}
