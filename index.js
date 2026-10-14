import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

let startGame = false;
let player;
let menuCat;
let logTemplate;
let coinTemplate;
let isJumping = false;
let jumpTime = 0;
const jumpDuration = 0.6; // Длительность прыжка в секундах
const jumpHeight = 1.8; // Максимальная высота прыжка
let isGameOver = false;

const clock = new THREE.Clock();

// Инициализация сцены, камеры и рендерера
const scene = new THREE.Scene();
// Туман в конце дороги
scene.fog = new THREE.FogExp2("#ffd7d7", 0.04);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

// const axesHelper = new THREE.AxesHelper(3);
// scene.add(axesHelper);

camera.position.set(0, 0.3, 1);
camera.lookAt(0, 0.2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Добавляем свет
const ambientLight = new THREE.AmbientLight("white", 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight("white", 1); // как солнце
dirLight.position.set(5, 5, 5);
dirLight.castShadow = true; // включаем тени для направленного света
scene.add(dirLight);

// Создаем дорогу
const roadGeometry = new THREE.PlaneGeometry(6, 100);
const roadMaterial = new THREE.MeshStandardMaterial({
  color: "#C1C1C5",
  roughness: 0.2,
});
const road = new THREE.Mesh(roadGeometry, roadMaterial);
road.rotation.x = -Math.PI / 2; // Кладем плоскость горизонтально
road.position.z = -40;
scene.add(road);

// Полосы дороги

const laneMarkingGeometry = new THREE.PlaneGeometry(0.06, 2);
const laneMarkingMaterial = new THREE.MeshBasicMaterial({ color: "white" });
const laneMarkings = [-0.9, 0.9].map((x) => {
  const marking = new THREE.Group();
  marking.position.set(x, 0.01, road.position.z);

  for (let z = -48; z <= 48; z += 4) {
    const dash = new THREE.Mesh(laneMarkingGeometry, laneMarkingMaterial);
    dash.rotation.x = -Math.PI / 2;
    dash.position.z = z;
    marking.add(dash);
  }

  scene.add(marking);
  return marking;
});

// Создаем игрока (котик)

const loader = new GLTFLoader();
let mixer; // Нужен для проигрывания анимации
let mixerCat;
let playerAnimations;

loader.load(
  "models/cat/scene.gltf",
  (gltf) => {
    player = gltf.scene;
    menuCat = clone(player);
    player.scale.set(3, 3, 3); // Подгоняем размер под игру
    player.position.set(0, 0.4, 2);
    player.rotation.y = Math.PI;

    menuCat.scale.set(1.5, 1.5, 1.5);
    menuCat.position.set(0, 0, 0);

    scene.add(menuCat);

    mixer = new THREE.AnimationMixer(player);
    mixerCat = new THREE.AnimationMixer(menuCat);
    // Проверяем массив анимаций
    if (gltf.animations && gltf.animations.length > 0) {
      playerAnimations = gltf.animations;

      const startAnimation = playerAnimations.find((anim) =>
        anim.name.includes("06_Greeting_LittleFriends"),
      );

      // анимация бега
      const runAnimation = playerAnimations.find((anim) =>
        anim.name.includes("04_Run_LittleFriends"),
      );

      if (startAnimation) {
        const action = mixerCat.clipAction(startAnimation);
        action.play();
      }

      if (runAnimation) {
        const action = mixer.clipAction(runAnimation);
        action.play();
      }
    }
  },
  undefined,
  (error) => {
    console.error("Ошибка загрузки модели:", error);
  },
);

loader.load(
  "models/logs/scene.gltf",
  (gltf) => {
    const logModel = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(logModel); // оборачиваем модель в ограничивающий прямоугольник
    const center = bounds.getCenter(new THREE.Vector3()); // ищем центр этого прямоугольника
    logModel.position.set(-center.x, -bounds.min.y, -center.z);

    logTemplate = new THREE.Group();
    logTemplate.add(logModel);
    logTemplate.scale.setScalar(1.5);
  },
  undefined,
  (error) => {
    console.error("Ошибка загрузки модели:", error);
  },
);

loader.load(
  "models/coin/scene.gltf",
  (gltf) => {
    const coinModel = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(coinModel); // оборачиваем модель в ограничивающий прямоугольник
    const center = bounds.getCenter(new THREE.Vector3()); // ищем центр этого прямоугольника
    coinModel.position.set(-center.x, -bounds.min.y, -center.z);

    coinTemplate = new THREE.Group();
    coinTemplate.add(coinModel);
    coinTemplate.scale.setScalar(0.8);
  },
  undefined,
  (error) => {
    console.error("Ошибка загрузки модели:", error);
  },
);

// Линии движения: левая (-1.8), средняя (0), правая (1.8)
const lanes = [-1.8, 0, 1.8];
let currentLaneIndex = 1; // Начинаем по центру
let targetX = lanes[currentLaneIndex];

// Управление с клавиатуры
window.addEventListener("keydown", (e) => {
  if (isGameOver) return; // Игнорируем нажатия, если игра окончена

  if ((e.key === "ArrowLeft" || e.code === "KeyA") && currentLaneIndex > 0) {
    currentLaneIndex--;
  }

  if (
    (e.key === "ArrowRight" || e.code === "KeyD") &&
    currentLaneIndex < lanes.length - 1
  ) {
    currentLaneIndex++;
  }

  if (e.code === "Space" && !isJumping && playerAnimations) {
    isJumping = true;
    jumpTime = 0; // Сбрасываем таймер прыжка

    const jumpAnimation = playerAnimations.find((anim) =>
      anim.name.includes("05_Jump_LittleFriends"),
    );

    if (jumpAnimation && mixer) {
      mixer.stopAllAction(); // останаливаем все анимации
      const action = mixer.clipAction(jumpAnimation);
      action.setLoop(THREE.LoopOnce, 1); // воспроизводим анимацию 1 раз
      action.clampWhenFinished = true;
      action.play();

      setTimeout(() => {
        const runAnimation = playerAnimations.find((anim) =>
          anim.name.includes("04_Run_LittleFriends"),
        );

        if (runAnimation) {
          const action = mixer.clipAction(runAnimation);
          action.play();
        }
      }, jumpDuration * 1000);
    }
  }
  targetX = lanes[currentLaneIndex];
});

// Препятствия
const obstacles = [];

function spawnObstacle() {
  if (isGameOver || !logTemplate) return;

  const randomLane = Math.floor(Math.random() * lanes.length);
  const obstacle = clone(logTemplate);
  obstacle.position.set(lanes[randomLane], 0, -60);
  scene.add(obstacle);
  obstacles.push(obstacle);
}

// Монетки

const coins = [];

function spawnCoin() {
  if (isGameOver || !coinTemplate) return;

  const randomLane = Math.floor(Math.random() * lanes.length);
  const coin = clone(coinTemplate);
  coin.position.set(lanes[randomLane], 0, -80);
  scene.add(coin);
  coins.push(coin);
}

// Спавним препятствие каждые 1.5 секунды
setInterval(spawnObstacle, 1500);
setInterval(spawnCoin, 1500);

let score = 0;
const scoreElement = document.getElementById("score");
const gameSpeed = 0.1; // Скорость движения мира

// Игровой цикл
function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();

  if (startGame && mixer) {
    mixer.update(deltaTime);
  }

  if (!startGame && mixerCat) {
    mixerCat.update(deltaTime);
  }

  if (!startGame) {
    renderer.setClearColor("#ffd7d7");
    renderer.render(scene, camera);
    return;
  }

  // Если игра завершена, прекращаем обновление логики сцены
  if (isGameOver) return;

  // Плавное перемещение игрока между линиями (интерполяция)
  if (player) {
    player.position.x += (targetX - player.position.x) * 0.2;

    if (isJumping) {
      jumpTime += deltaTime;
      const progress = jumpTime / jumpDuration; // Прогресс прыжка от 0 до 1

      if (progress < 1) {
        // Math.sin(progress * Math.PI) плавно поднимает и опускает значение от 0 до 1 и обратно до 0
        player.position.y = 0.4 + Math.sin(progress * Math.PI) * jumpHeight;
      } else {
        // Прыжок завершен, возвращаем котика на дорогу
        player.position.y = 0.4;
        isJumping = false;
      }

      if (player.position.y <= 0.4) {
        player.position.y = 0.4;
        isJumping = false;
      }
    }
  }

  // Движение дороги
  road.position.z += gameSpeed;
  laneMarkings.forEach((marking) => {
    marking.position.z = road.position.z;
  });
  if (road.position.z > 10) {
    road.position.z = -20;
    laneMarkings.forEach((marking) => {
      marking.position.z = road.position.z;
    });
  }

  // Движение и проверка препятствий
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.position.z += gameSpeed;

    // Проверка столкновения (упрощенная по координатам)
    const distanceX = Math.abs(player.position.x - obs.position.x);
    const distanceZ = Math.abs(player.position.z - obs.position.z);

    if (distanceX < 0.6 && distanceZ < 0.6 && player.position.y < 0.8) {
      isGameOver = true;
      const gameOverBlock = createGameOver(score);
      player.rotation.x = Math.PI * 0.4;
      document.body.append(gameOverBlock);
    }

    // Удаляем препятствие, когда оно пролетело мимо игрока, и начисляем очко
    if (obs.position.z > 5) {
      scene.remove(obs);
      obstacles.splice(i, 1);
    }
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    coin.position.z += gameSpeed;

    if (player) {
      const distanceX = Math.abs(player.position.x - coin.position.x);
      const distanceZ = Math.abs(player.position.z - coin.position.z);

      if (distanceX < 0.8 && distanceZ < 0.8) {
        scene.remove(coin);
        coins.splice(i, 1);
        score += 10;
        const points = addedPoints(10);
        document.body.append(points);
        setTimeout(() => {
          points.remove();
        }, 2500)
        scoreElement.innerText = score;
        continue;
      }
    }

    if (coin.position.z > 5) {
      scene.remove(coin);
      coins.splice(i, 1);
    }
  }

  renderer.setClearColor("#ffd7d7");

  renderer.render(scene, camera);
}

function createGameOver(scoreValue) {
  const container = document.createElement("div");
  const title = document.createElement("p");
  const score = document.createElement("p");
  const resetBtn = document.createElement("button");

  container.classList.add("game-over");
  title.classList.add("game-over__title");
  score.classList.add("game-over__score");
  resetBtn.classList.add("btn");

  title.textContent = "Игра окончена!";
  score.innerHTML = `Твой счёт: ${scoreValue}`;

  container.append(title, score, resetBtn);

  resetBtn.textContent = "Попробовать снова";

  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    location.reload(); // Перезапуск страницы при столкновении
  });

  return container;
}

function createGameStart() {
  const startBlock = document.createElement("div");
  const btnStart = document.createElement("button");

  btnStart.classList.add("btn");
  startBlock.classList.add("start-game");

  btnStart.textContent = "Начать игру";

  btnStart.addEventListener("click", (e) => {
    e.preventDefault();

    if (menuCat) {
      scene.remove(menuCat);
    }
    startBlock.remove();

    if (player) {
      scene.add(player);
    }

    startGame = true;

    camera.position.set(0, 3, 6); // Ставим камеру чуть сзади и выше
    camera.lookAt(0, 0, -5);
  });

  startBlock.append(btnStart);

  document.body.append(startBlock);
}

function addedPoints(pointValue) {
  const point = document.createElement('p');

  point.classList.add('points');

  point.textContent = `+${pointValue}`;

  return point;
}

// Обработка изменения размера окна
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("DOMContentLoaded", () => {
  animate();

  createGameStart();
});
