const blindLevels = [
  { level: 1, sb: 10, bb: 20, ante: 20 },
  { level: 2, sb: 20, bb: 40, ante: 40 },
  { level: 3, sb: 30, bb: 60, ante: 60 },
  { level: 4, sb: 50, bb: 100, ante: 100 },
  { level: 5, sb: 80, bb: 160, ante: 160 },
  { level: 6, sb: 100, bb: 200, ante: 200 },
  { level: 7, sb: 150, bb: 300, ante: 300 },
  { level: 8, sb: 200, bb: 400, ante: 400 },
  { level: 9, sb: 300, bb: 600, ante: 600 },
  { level: 10, sb: 400, bb: 800, ante: 800 }
];

module.exports = {
  blindLevels,
  careerEarningsBoard: [
    { player: "T ZONG", earnings: 80 },
    { player: "YAO JINDA", earnings: 80 },
    { player: "YA SEN", earnings: 40 },
    { player: "LI JIAHUI", earnings: 40 }
  ],
  levelDuration: 480,
  thinkingDuration: 20,
  timeCardExtra: 30
};
