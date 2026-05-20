import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const today = new Date().toISOString().slice(0, 10);

  // ========== 基础计数器 ==========
  const [
    pv, pvToday,
    quizStarts, quizStartsToday,
    quizCompletes, quizCompletesToday,
    quizSkips, quizSkipsToday,
    quizRetakes,
    quizBacks,
    enterApp, skipQuiz,
    shareResult, shareResultToday,
    shareIndex,
    recordPos, recordNeg, recordDeletes,
    fortuneDraws,
    tabFeed, tabIndex, tabCapsule,
    indexRefreshes,
    capsuleSeals, capsuleOpens,
    upshoreClicks
  ] = await redis.pipeline()
    .get('whining-era:pv')
    .get(`whining-era:pv:daily:${today}`)
    .get('whining-era:quiz:starts')
    .get(`whining-era:quiz:starts:daily:${today}`)
    .get('whining-era:quiz:completes')
    .get(`whining-era:quiz:completes:daily:${today}`)
    .get('whining-era:quiz:skips')
    .get(`whining-era:quiz:skips:daily:${today}`)
    .get('whining-era:quiz:retakes')
    .get('whining-era:quiz:backs')
    .get('whining-era:enter:app')
    .get('whining-era:skip:quiz')
    .get('whining-era:share:result')
    .get(`whining-era:share:result:daily:${today}`)
    .get('whining-era:share:index')
    .get('whining-era:record:pos')
    .get('whining-era:record:neg')
    .get('whining-era:record:deletes')
    .get('whining-era:fortune:draws')
    .get('whining-era:tab:feed')
    .get('whining-era:tab:index')
    .get('whining-era:tab:capsule')
    .get('whining-era:index:refreshes')
    .get('whining-era:capsule:seals')
    .get('whining-era:capsule:opens')
    .get('whining-era:upshore:clicks')
    .exec();

  // ========== 分数数据 ==========
  const [scores] = await redis.pipeline()
    .lrange('whining-era:quiz:scores', 0, -1)
    .exec();

  const scoreList = (scores || []).map(Number);
  const avgScore = scoreList.length > 0
    ? (scoreList.reduce((a, b) => a + b, 0) / scoreList.length).toFixed(1)
    : 0;

  // 分数分布
  const dist = [0, 0, 0, 0, 0];
  scoreList.forEach(s => {
    if (s <= 20) dist[0]++;
    else if (s <= 40) dist[1]++;
    else if (s <= 60) dist[2]++;
    else if (s <= 80) dist[3]++;
    else dist[4]++;
  });

  // 段位分布
  const rankKeys = ['insulator', 'reserve', 'hesitant', 'muttering', 'loop', 'broadcast', 'queen'];
  const rankLabels = ['绝缘体', '预备役', '欲言又止', '碎碎念', '单曲循环', '广播中', '本嫂'];
  const rankPipeline = redis.pipeline();
  rankKeys.forEach(k => rankPipeline.get(`whining-era:quiz:rank:${k}`));
  const rankResults = await rankPipeline.exec();
  const rankDist = rankKeys.map((k, i) => ({
    key: k,
    label: rankLabels[i],
    count: parseInt(rankResults[i]) || 0
  }));

  // ========== 题目选项分布 ==========
  const questionDist = [];
  for (let q = 0; q < 15; q++) {
    const qPipeline = redis.pipeline();
    ['A', 'B', 'C', 'D'].forEach(opt => qPipeline.get(`whining-era:quiz:q${q}:${opt}`));
    const qResults = await qPipeline.exec();
    const total = qResults.reduce((sum, v) => sum + (parseInt(v) || 0), 0);
    questionDist.push({
      question: q + 1,
      options: ['A', 'B', 'C', 'D'].map((opt, i) => ({
        option: opt,
        count: parseInt(qResults[i]) || 0,
        pct: total > 0 ? (((parseInt(qResults[i]) || 0) / total) * 100).toFixed(1) : 0
      })),
      total
    });
  }

  // ========== 标签使用排行 ==========
  const tagKeys = ['小确幸', '有进展', '拿到offer', '被夸了', 'emo', '被拒', 'HR鬼魂', '想躺平'];
  const tagPipeline = redis.pipeline();
  tagKeys.forEach(t => tagPipeline.get(`whining-era:record:tags:${t}`));
  const tagResults = await tagPipeline.exec();
  const tagRanking = tagKeys
    .map((t, i) => ({ tag: t, count: parseInt(tagResults[i]) || 0 }))
    .sort((a, b) => b.count - a.count);

  // ========== 数值转换 ==========
  const n = (v) => parseInt(v) || 0;

  const stats = {
    // 流量
    traffic: {
      pv: n(pv),
      pvToday: n(pvToday)
    },
    // 测试漏斗
    funnel: {
      starts: n(quizStarts),
      startsToday: n(quizStartsToday),
      completes: n(quizCompletes),
      completesToday: n(quizCompletesToday),
      skips: n(quizSkips),
      skipsToday: n(quizSkipsToday),
      retakes: n(quizRetakes),
      backs: n(quizBacks),
      completionRate: n(quizStarts) > 0 ? ((n(quizCompletes) / n(quizStarts)) * 100).toFixed(1) : 0,
      skipRate: n(quizStarts) > 0 ? ((n(quizSkips) / n(quizStarts)) * 100).toFixed(1) : 0,
      retakeRate: n(quizCompletes) > 0 ? ((n(quizRetakes) / n(quizCompletes)) * 100).toFixed(1) : 0
    },
    // 结果页转化
    result: {
      enterApp: n(enterApp),
      skipQuiz: n(skipQuiz),
      shareResult: n(shareResult),
      shareResultToday: n(shareResultToday),
      shareIndex: n(shareIndex),
      resultToAppRate: n(quizCompletes) > 0 ? ((n(enterApp) / n(quizCompletes)) * 100).toFixed(1) : 0
    },
    // 档案馆
    archive: {
      recordPos: n(recordPos),
      recordNeg: n(recordNeg),
      recordDeletes: n(recordDeletes),
      fortuneDraws: n(fortuneDraws),
      capsuleSeals: n(capsuleSeals),
      capsuleOpens: n(capsuleOpens),
      upshoreClicks: n(upshoreClicks),
      tabFeed: n(tabFeed),
      tabIndex: n(tabIndex),
      tabCapsule: n(tabCapsule),
      indexRefreshes: n(indexRefreshes),
      posNegRatio: n(recordNeg) > 0 ? ((n(recordPos) / n(recordNeg)).toFixed(2)) : n(recordPos) > 0 ? '∞' : '0'
    },
    // 测试数据
    quiz: {
      count: scoreList.length,
      avgScore,
      distribution: dist,
      rankDistribution: rankDist,
      scores: scoreList.slice(0, 50)
    },
    // 题目分析
    questions: questionDist,
    // 标签排行
    tags: tagRanking
  };

  res.status(200).json(stats);
}
