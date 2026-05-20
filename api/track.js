import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { event, data = {} } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  try {
    switch (event) {
      // ========== 流量 ==========
      case 'pageview': {
        const key = `whining-era:pv:ip:${ip}`;
        const viewed = await redis.get(key);
        if (!viewed) {
          await redis.setex(key, 86400, '1');
          await redis.incr('whining-era:pv');
          await redis.incr(`whining-era:pv:daily:${today}`);
        }
        break;
      }

      // ========== 测试漏斗 ==========
      case 'quiz_start': {
        await redis.incr('whining-era:quiz:starts');
        await redis.incr(`whining-era:quiz:starts:daily:${today}`);
        break;
      }
      case 'quiz_answer': {
        const { question, option } = data;
        if (question !== undefined && option !== undefined) {
          await redis.incr(`whining-era:quiz:q${question}:${option}`);
        }
        break;
      }
      case 'quiz_back': {
        await redis.incr('whining-era:quiz:backs');
        break;
      }
      case 'quiz_skip': {
        await redis.incr('whining-era:quiz:skips');
        await redis.incr(`whining-era:quiz:skips:daily:${today}`);
        break;
      }
      case 'quiz_complete': {
        const { score } = data;
        await redis.incr('whining-era:quiz:completes');
        await redis.incr(`whining-era:quiz:completes:daily:${today}`);
        if (typeof score === 'number') {
          await redis.lpush('whining-era:quiz:scores', String(score));
          await redis.ltrim('whining-era:quiz:scores', 0, 999);
          // 按段位统计
          let rankKey = 'unknown';
          if (score <= 20) rankKey = 'insulator';
          else if (score <= 40) rankKey = 'reserve';
          else if (score <= 60) rankKey = 'hesitant';
          else if (score <= 70) rankKey = 'muttering';
          else if (score <= 80) rankKey = 'loop';
          else if (score <= 90) rankKey = 'broadcast';
          else rankKey = 'queen';
          await redis.incr(`whining-era:quiz:rank:${rankKey}`);
        }
        break;
      }
      case 'quiz_retake': {
        await redis.incr('whining-era:quiz:retakes');
        break;
      }

      // ========== 结果页 ==========
      case 'share_result': {
        await redis.incr('whining-era:share:result');
        await redis.incr(`whining-era:share:result:daily:${today}`);
        break;
      }
      case 'enter_app': {
        await redis.incr('whining-era:enter:app');
        break;
      }
      case 'skip_quiz': {
        await redis.incr('whining-era:skip:quiz');
        break;
      }

      // ========== 档案馆 ==========
      case 'record_submit': {
        const { type, tags = [] } = data;
        if (type === 'pos') {
          await redis.incr('whining-era:record:pos');
        } else if (type === 'neg') {
          await redis.incr('whining-era:record:neg');
        }
        for (const tag of tags) {
          await redis.incr(`whining-era:record:tags:${tag}`);
        }
        break;
      }
      case 'record_delete': {
        await redis.incr('whining-era:record:deletes');
        break;
      }
      case 'fortune_draw': {
        await redis.incr('whining-era:fortune:draws');
        break;
      }
      case 'tab_switch': {
        const { tab } = data;
        if (tab) {
          await redis.incr(`whining-era:tab:${tab}`);
        }
        break;
      }
      case 'index_refresh': {
        await redis.incr('whining-era:index:refreshes');
        break;
      }
      case 'share_index': {
        await redis.incr('whining-era:share:index');
        break;
      }
      case 'capsule_seal': {
        await redis.incr('whining-era:capsule:seals');
        break;
      }
      case 'capsule_open': {
        await redis.incr('whining-era:capsule:opens');
        break;
      }
      case 'upshore_click': {
        await redis.incr('whining-era:upshore:clicks');
        break;
      }

      default:
        break;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
