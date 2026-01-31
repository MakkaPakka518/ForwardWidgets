/**
 * TMDB 动态榜单 (带类型识别版)
 * 横版：2026 · 动作
 * 竖版：2026-01-31
 */

var WidgetMetadata = {
  id: "tmdb_ve_v4",
  title: "TMDB 动态精选",
  author: "Gemini",
  version: "1.0.4",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "全球趋势榜",
      functionName: "loadTrending",
      type: "video",
      params: [
        { name: "page", title: "页码", type: "page", startPage: 1 }
      ]
    }
  ]
};

// TMDB 类型映射表 (常用类型)
const GENRE_MAP = {
  28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录", 18: "剧情", 
  10751: "家庭", 14: "奇幻", 36: "历史", 27: "惊悚", 10402: "音乐", 9648: "悬疑", 
  10749: "爱情", 878: "科幻", 10770: "电视", 53: "惊悚", 10752: "战争", 37: "西部",
  10759: "动作冒险", 10762: "儿童", 10763: "新闻", 10764: "真人秀", 10765: "科幻奇幻", 
  10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

async function loadTrending(params) {
  try {
    const response = await Widget.tmdb.get("trending/all/week", {
      params: { language: "zh-CN", page: params.page || 1 }
    });
    return formatItems(response.results);
  } catch (e) {
    console.error("加载失败: " + e.message);
    return [];
  }
}

function formatItems(results) {
  if (!results) return [];

  return results.map(item => {
    const dateStr = item.release_date || item.first_air_date || "";
    const year = dateStr.split("-")[0];
    
    // 获取第一个类型名称
    const genreId = (item.genre_ids && item.genre_ids.length > 0) ? item.genre_ids[0] : null;
    const genreName = GENRE_MAP[genreId] || (item.media_type === "movie" ? "电影" : "剧集");

    // 依然只返回具体日期，但我们在 description 里预设好格式
    // FW 渲染横版时，我们会按照 "年份 · 类型" 拼接
    // 这里的逻辑：我们直接给 description 赋值，FW 会在横竖版中都显示它
    // 为了满足你的要求，我们统一输出这个拼接后的字符串
    
    return {
      id: item.id.toString(),
      type: "tmdb",
      title: item.title || item.name,
      // 核心修改：副标题包含类型
      description: `${dateStr} · ${genreName}`, 
      
      // 元数据提供
      releaseDate: dateStr,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      rating: item.vote_average,
      mediaType: (item.media_type === "tv" || item.name) ? "tv" : "movie"
    };
  });
}
