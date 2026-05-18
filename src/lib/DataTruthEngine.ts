export interface DataStats {
  rowCount: number;
  columnCount: number;
  nullCount: number;
  anomalyCount: number;
  completenessScore: number;
  numericSummary: Record<string, { min: number; max: number; avg: number; sum: number }>;
  categoricalSummary: Record<string, { uniqueCount: number; topValues: { value: string; count: number }[] }>;
  dateSummary: Record<string, { min: string; max: string }>;
  typeConfidence: Record<string, number>;
  dataQualityScore: number;
  datasetFingerprint: string;
  topDimensions: string[];
  topMeasures: string[];
  outlierSummary: Record<string, number>;
}

export interface SpaceDataStats {
  totalRowCount: number;
  totalColumnCount: number;
  overallCompletenessScore: number;
  overallDataQualityScore: number;
  totalAnomalyCount: number;
  datasetsStats: Record<string, DataStats>;
}

export function computeDataTruth(data: any[]): DataStats {
  if (!data || data.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      nullCount: 0,
      anomalyCount: 0,
      completenessScore: 0,
      numericSummary: {},
      categoricalSummary: {},
      dateSummary: {},
      typeConfidence: {},
      dataQualityScore: 0,
      datasetFingerprint: 'empty',
      topDimensions: [],
      topMeasures: [],
      outlierSummary: {}
    };
  }

  const columns = Object.keys(data[0]);
  const stats: DataStats = {
    rowCount: data.length,
    columnCount: columns.length,
    nullCount: 0,
    anomalyCount: 0,
    completenessScore: 100,
    numericSummary: {},
    categoricalSummary: {},
    dateSummary: {},
    typeConfidence: {},
    dataQualityScore: 100,
    datasetFingerprint: `fps_${data.length}_${columns.length}`,
    topDimensions: [],
    topMeasures: [],
    outlierSummary: {}
  };

  let totalCells = data.length * columns.length;
  let totalNulls = 0;

  columns.forEach((col) => {
    let isNumeric = true;
    let nullCount = 0;

    for (let i = 0; i < Math.min(data.length, 50); i++) {
       const val = data[i][col];
       if (val == null || val === '') {
         nullCount++;
         continue;
       }
       if (isNaN(Number(val))) {
         isNumeric = false;
         break;
       }
    }

    if (nullCount > data.length * 0.2) {
      stats.anomalyCount++;
    }
    totalNulls += nullCount;

    if (isNumeric) {
      stats.topMeasures.push(col);
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      let validCount = 0;

      data.forEach((row) => {
        const val = Number(row[col]);
        if (!isNaN(val)) {
          sum += val;
          if (val < min) min = val;
          if (val > max) max = val;
          validCount++;
        }
      });
      stats.numericSummary[col] = {
        sum,
        min: validCount > 0 ? min : 0,
        max: validCount > 0 ? max : 0,
        avg: validCount > 0 ? sum / validCount : 0,
      };
    } else {
      stats.topDimensions.push(col);
      const counts: Record<string, number> = {};
      data.forEach((row) => {
        const val = String(row[col] ?? '');
        if (val) counts[val] = (counts[val] || 0) + 1;
      });
      
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([val, count]) => ({ value: val, count }));
        
      stats.categoricalSummary[col] = {
        uniqueCount: sorted.length,
        topValues: sorted.slice(0, 5)
      };
    }
  });

  stats.nullCount = totalNulls;
  stats.completenessScore = totalCells > 0 ? Math.round(((totalCells - totalNulls) / totalCells) * 100) : 0;
  stats.dataQualityScore = Math.max(0, stats.completenessScore - (stats.anomalyCount * 5));

  return stats;
}

export function computeSpaceDataTruth(datasets: any[]): SpaceDataStats {
  const spaceStats: SpaceDataStats = {
    totalRowCount: 0,
    totalColumnCount: 0,
    overallCompletenessScore: 0,
    overallDataQualityScore: 0,
    totalAnomalyCount: 0,
    datasetsStats: {}
  };

  if (!datasets || datasets.length === 0) return spaceStats;

  let totalCompleteness = 0;
  let totalQuality = 0;

  datasets.forEach((ds, idx) => {
    const data = ds.data || [];
    const stats = computeDataTruth(data);
    const dsId = ds.id || ds.name || `dataset_${idx}`;
    spaceStats.datasetsStats[dsId] = stats;

    spaceStats.totalRowCount += stats.rowCount;
    spaceStats.totalColumnCount += stats.columnCount;
    spaceStats.totalAnomalyCount += stats.anomalyCount;
    totalCompleteness += stats.completenessScore;
    totalQuality += stats.dataQualityScore;
  });

  spaceStats.overallCompletenessScore = Math.round(totalCompleteness / datasets.length);
  spaceStats.overallDataQualityScore = Math.round(totalQuality / datasets.length);

  return spaceStats;
}
