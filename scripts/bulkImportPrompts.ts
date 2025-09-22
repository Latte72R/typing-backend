import { PrismaClient, ContestLanguage } from '@prisma/client';

const prisma = new PrismaClient();

type SeedPrompt = {
  displayText: string;
  typingTarget: string;
  tags: string[];
};

const fruits: SeedPrompt[] = [
  { displayText: 'ばなな', typingTarget: 'banana', tags: ['fruit'] },
  { displayText: 'りんご', typingTarget: 'ringo', tags: ['fruit'] },
  { displayText: 'みかん', typingTarget: 'mikan', tags: ['fruit'] },
  { displayText: 'ぶどう', typingTarget: 'budou', tags: ['fruit'] },
  { displayText: 'いちご', typingTarget: 'ichigo', tags: ['fruit'] },
  { displayText: 'もも', typingTarget: 'momo', tags: ['fruit'] },
  { displayText: 'すいか', typingTarget: 'suika', tags: ['fruit'] },
  { displayText: 'なし', typingTarget: 'nashi', tags: ['fruit'] },
  { displayText: 'さくらんぼ', typingTarget: 'sakuranbo', tags: ['fruit'] },
  { displayText: 'かき', typingTarget: 'kaki', tags: ['fruit'] },
  { displayText: 'きうい', typingTarget: 'kiui', tags: ['fruit'] },
  { displayText: 'ぱいなっぷる', typingTarget: 'painappuru', tags: ['fruit'] },
  { displayText: 'ぶるーべりー', typingTarget: 'buruuberii', tags: ['fruit'] },
  { displayText: 'れもん', typingTarget: 'remon', tags: ['fruit'] },
  { displayText: 'めろん', typingTarget: 'meron', tags: ['fruit'] },
  { displayText: 'ぐれーぷふるーつ', typingTarget: 'gureepufuruutsu', tags: ['fruit'] },
  { displayText: 'あんず', typingTarget: 'anzu', tags: ['fruit'] },
  { displayText: 'かりん', typingTarget: 'karin', tags: ['fruit'] },
  { displayText: 'すもも', typingTarget: 'sumomo', tags: ['fruit'] },
  { displayText: 'ざくろ', typingTarget: 'zakuro', tags: ['fruit'] },
];

const vegetables: SeedPrompt[] = [
  { displayText: 'とまと', typingTarget: 'tomato', tags: ['vegetable'] },
  { displayText: 'きゅうり', typingTarget: 'kyuuri', tags: ['vegetable'] },
  { displayText: 'にんじん', typingTarget: 'ninjin', tags: ['vegetable'] },
  { displayText: 'たまねぎ', typingTarget: 'tamanegi', tags: ['vegetable'] },
  { displayText: 'じゃがいも', typingTarget: 'jagaimo', tags: ['vegetable'] },
  { displayText: 'なす', typingTarget: 'nasu', tags: ['vegetable'] },
  { displayText: 'ほうれんそう', typingTarget: 'hourensou', tags: ['vegetable'] },
  { displayText: 'きゃべつ', typingTarget: 'kyabetsu', tags: ['vegetable'] },
  { displayText: 'れたす', typingTarget: 'retasu', tags: ['vegetable'] },
  { displayText: 'ぴーまん', typingTarget: 'piiman', tags: ['vegetable'] },
  { displayText: 'だいこん', typingTarget: 'daikon', tags: ['vegetable'] },
  { displayText: 'ごぼう', typingTarget: 'gobou', tags: ['vegetable'] },
  { displayText: 'れんこん', typingTarget: 'renkon', tags: ['vegetable'] },
  { displayText: 'かぼちゃ', typingTarget: 'kabocha', tags: ['vegetable'] },
  { displayText: 'ししとう', typingTarget: 'shishitou', tags: ['vegetable'] },
  { displayText: 'ぶろっこりー', typingTarget: 'burokkorii', tags: ['vegetable'] },
  { displayText: 'かりふらわー', typingTarget: 'karifurawaa', tags: ['vegetable'] },
  { displayText: 'あすぱらがす', typingTarget: 'asuparagasu', tags: ['vegetable'] },
  { displayText: 'にら', typingTarget: 'nira', tags: ['vegetable'] },
  { displayText: 'さつまいも', typingTarget: 'satsumaimo', tags: ['vegetable'] },
];

const flowers: SeedPrompt[] = [
  { displayText: 'さくら', typingTarget: 'sakura', tags: ['flower'] },
  { displayText: 'うめ', typingTarget: 'ume', tags: ['flower'] },
  { displayText: 'きく', typingTarget: 'kiku', tags: ['flower'] },
  { displayText: 'ばら', typingTarget: 'bara', tags: ['flower'] },
  { displayText: 'あじさい', typingTarget: 'ajisai', tags: ['flower'] },
  { displayText: 'ひまわり', typingTarget: 'himawari', tags: ['flower'] },
  { displayText: 'ゆり', typingTarget: 'yuri', tags: ['flower'] },
  { displayText: 'すみれ', typingTarget: 'sumire', tags: ['flower'] },
  { displayText: 'たんぽぽ', typingTarget: 'tanpopo', tags: ['flower'] },
  { displayText: 'こすもす', typingTarget: 'kosumosu', tags: ['flower'] },
  { displayText: 'ぼたん', typingTarget: 'botan', tags: ['flower'] },
  { displayText: 'つばき', typingTarget: 'tsubaki', tags: ['flower'] },
  { displayText: 'あやめ', typingTarget: 'ayame', tags: ['flower'] },
  { displayText: 'すいせん', typingTarget: 'suisen', tags: ['flower'] },
  { displayText: 'らん', typingTarget: 'ran', tags: ['flower'] },
  { displayText: 'なのはな', typingTarget: 'nanohana', tags: ['flower'] },
  { displayText: 'ふじ', typingTarget: 'fuji', tags: ['flower'] },
  { displayText: 'しゃくやく', typingTarget: 'shakuyaku', tags: ['flower'] },
  { displayText: 'はす', typingTarget: 'hasu', tags: ['flower'] },
  { displayText: 'さざんか', typingTarget: 'sazanka', tags: ['flower'] },
];

const seeds: SeedPrompt[] = [...fruits, ...vegetables, ...flowers];

async function main() {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const seed of seeds) {
    const existing = await prisma.prompt.findFirst({
      where: {
        language: ContestLanguage.ROMAJI,
        displayText: seed.displayText,
        typingTarget: seed.typingTarget,
      },
    });

    if (existing) {
      skipped.push(seed.displayText);
      continue;
    }

    await prisma.prompt.create({
      data: {
        language: ContestLanguage.ROMAJI,
        displayText: seed.displayText,
        typingTarget: seed.typingTarget,
        tags: seed.tags,
      },
    });

    created.push(seed.displayText);
  }

  if (created.length > 0) {
    console.log(`作成: ${created.join(', ')}`);
  }
  if (skipped.length > 0) {
    console.log(`既存のためスキップ: ${skipped.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error('プロンプト投入中にエラーが発生しました', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
