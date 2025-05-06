import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer;
let player, stairs = [];
let enemies = []; // Array to hold enemy objects
let treasures = []; // Array to hold treasure objects
let treasureModel = null; // To store the loaded treasure model
let gameStarted = false;
let baseScore = 0; // Score from climbing
let treasureBonus = 0; // Score from treasures
let clock = new THREE.Clock(); // Clock for delta time

// Player falling off side state
let isPlayerFallingOffSide = false;
let playerFallOffSideStartTime = 0;

// --- Player State ---
let velocityY = 0;
let onGround = false;

// --- Constants ---
const STAIR_WIDTH = 4;
const STAIR_HEIGHT = 0.5;
const STAIR_DEPTH = 1;
const STAIR_GAP = 0.1; // Vertical gap
const NUM_INITIAL_STAIRS = 60; // Increased significantly
const PLAYER_FORWARD_SPEED = 5;
const PLAYER_SIDE_SPEED = 4;
const PLAYER_SIZE = 1;
const GRAVITY = -15; // Adjusted gravity value
const JUMP_FORCE = 10; // Increased jump force (was 7)
const STAIR_INCLINE_FACTOR = 0.3; // Increased incline (was 0.1)
const ENEMY_RADIUS = 0.5; // Changed from SIZE
const ENEMY_COLOR = 0xff0000; // Red
const ENEMY_SPAWN_CHANCE = 0.2; // 20% chance per new stair
const ENEMY_ROLL_ACCEL = -2.0; // Acceleration down the stairs (negative Z)
const ENEMY_MAX_ROLL_SPEED = -8.0; // Max speed down stairs
const ENEMY_ROTATION_SPEED = 5; // Visual rotation speed factor
const TREASURE_SIZE = 0.7;
const TREASURE_COLOR = 0x8B4513; // Saddle Brown
const TREASURE_SPAWN_CHANCE = 0.05; // 5% chance per new stair (much lower)
const TREASURE_SCORES = [5, 10, 15, 20];
const TREASURE_PROBS = [0.4, 0.3, 0.15, 0.15]; // Probabilities for [5, 10, 15, 20]

// --- Input State ---
const keys = {
    left: false,
    right: false,
    space: false
};

const startButton = document.getElementById('startButton');
const playAgainButton = document.getElementById('playAgainButton'); // New button reference
const canvas = document.getElementById('gameCanvas');
const instructionCard = document.getElementById('instructionCard'); // Added instruction card reference
// Get score element (assuming it exists in HTML or create it if needed)
let scoreElement = document.getElementById('score'); 
if (!scoreElement) { // Create if doesn't exist (like before)
    scoreElement = document.createElement('div');
    scoreElement.id = 'score';
    scoreElement.style.position = 'absolute';
    scoreElement.style.top = '10px';
    scoreElement.style.left = '10px';
    scoreElement.style.color = 'white';
    scoreElement.style.fontSize = '24px';
    scoreElement.style.fontFamily = 'Arial, sans-serif';
    scoreElement.style.display = 'none'; // Initially hidden
    document.body.appendChild(scoreElement);
}

const gameOverOverlay = document.getElementById('gameOverOverlay');
// We already defined finalScoreText inside the overlay in HTML
const finalScoreTextElement = document.getElementById('finalScoreText'); 
const floatingTextContainer = document.getElementById('floatingTextContainer'); // New container ref

// --- Mobile Detection & Touch State ---
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
const SWIPE_THRESHOLD = 50; // Min pixels horizontal distance for a swipe
const TAP_THRESHOLD_TIME = 200; // Max ms for a tap
const TAP_THRESHOLD_DIST = 10; // Max pixels moved for a tap

// --- GLTF Loader ---
const gltfLoader = new GLTFLoader();

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue

    // Camera
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    // camera.position.set(0, 5, -15); // Initial position before game starts
    camera.position.set(0, 5, 5); // Adjusted initial view
    camera.lookAt(0, 0, 0); // Look towards the center initially

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Lights (basic setup)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // --- Landscape Plane ---
    const landscapeGeometry = new THREE.PlaneGeometry(2000, 2000); // Very large plane
    const landscapeMaterial = new THREE.MeshBasicMaterial({ color: 0x228B22, side: THREE.DoubleSide });
    const landscapePlane = new THREE.Mesh(landscapeGeometry, landscapeMaterial);
    landscapePlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal (flat on XZ plane)
    landscapePlane.position.y = -2; // Position it below the stairs origin (adjust as needed)
    scene.add(landscapePlane);
    // --- End Landscape Plane ---

    // --- Load Treasure Model ---
    gltfLoader.load(
        'assets/low_poly_treasure_chest/scene.gltf', // Path to your NEW model
        function (gltf) {
            treasureModel = gltf.scene;
            if (gltf.animations && gltf.animations.length > 0) {
                treasureModel.userData.animations = gltf.animations;
            } else {
                // console.log("No animations found in the treasure model.");
            }
        },
        undefined, // onProgress callback (optional)
        function (error) {
            console.error('An error happened while loading the treasure model:', error);
        }
    );
    // --- End Load Treasure Model ---

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    // Start button listener
    startButton.addEventListener('click', () => {
        // Only works if game not started and button is visible
        if (!gameStarted && !startButton.classList.contains('hidden')) {
             startGame();
        }
    });

    // Play Again button listener
    playAgainButton.addEventListener('click', () => {
        // Only works if game not started and button is visible
        if (!gameStarted && !playAgainButton.classList.contains('hidden')) {
            startGame();
        }
    });

    // Keyboard listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Touch (conditionally)
    if (isMobile) {
        console.log("Mobile device detected, adding touch listeners.");
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    console.log("Three.js initialized."); 

    // Initial render to show background
    renderer.render(scene, camera);
    // Ensure initial state: overlay hidden, start button visible
    gameOverOverlay.classList.add('hidden');
    startButton.classList.remove('hidden');
}

function createPlayer() {
    const geometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
    const material = new THREE.MeshLambertMaterial({ color: 0x0000ff }); // Blue
    player = new THREE.Mesh(geometry, material);
    // Initial position slightly above the first stair's calculated position
    const firstStairY = 0; // First stair is at z=0, y=0
    player.position.set(0, firstStairY + STAIR_HEIGHT / 2 + PLAYER_SIZE / 2 + 0.1, 0); // Start slightly above
    player.geometry.computeBoundingBox(); // Important for collision detection
    scene.add(player);
    console.log("Player created at:", player.position);
}

function createStairs() {
    // Clear existing stairs if any (for restarting)
    stairs.forEach(stair => scene.remove(stair));
    stairs = [];

    const stairGeometry = new THREE.BoxGeometry(STAIR_WIDTH, STAIR_HEIGHT, STAIR_DEPTH);
    const stairMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00 }); // Yellow

    for (let i = 0; i < NUM_INITIAL_STAIRS; i++) {
        const stair = new THREE.Mesh(stairGeometry, stairMaterial);
        const zPos = i * (STAIR_DEPTH); // Place stairs contiguously for now
        const yPos = zPos * STAIR_INCLINE_FACTOR; // Use incline factor

        stair.position.set(0, yPos, zPos);
        stair.geometry.computeBoundingBox(); // Important for collision detection
        scene.add(stair);
        stairs.push(stair);

        // --- Chance to spawn a treasure on this new stair ---
        // Don't spawn on the very first few stairs to give player a moment
        if (i > 5 && Math.random() < TREASURE_SPAWN_CHANCE) {
             createTreasure(stair.position);
        }
        // --- End treasure spawn ---
    }
    console.log("Initial stairs created. Count:", stairs.length);
}

function createEnemy(stairPosition) {
    const geometry = new THREE.SphereGeometry(ENEMY_RADIUS, 16, 8); // Sphere: radius, widthSegments, heightSegments
    const material = new THREE.MeshLambertMaterial({ color: ENEMY_COLOR });
    const enemy = new THREE.Mesh(geometry, material);

    // Randomize X position
    const maxOffsetX = STAIR_WIDTH / 2 - ENEMY_RADIUS;
    const randomOffsetX = (Math.random() * 2 - 1) * maxOffsetX;

    enemy.position.copy(stairPosition);
    enemy.position.x += randomOffsetX;
    enemy.position.y += STAIR_HEIGHT / 2 + ENEMY_RADIUS; // Place on top of stair using radius
    
    // Physics properties
    enemy.userData.velocityY = 0;
    enemy.userData.velocityZ = 0; // Starts stationary or small initial push?
    enemy.userData.onGround = true; // Assume starts on ground
    enemy.userData.radius = ENEMY_RADIUS; // Store radius for convenience

    enemy.geometry.computeBoundingSphere(); // Use bounding sphere for potential checks
    enemy.geometry.computeBoundingBox(); // Keep box for current collision logic

    scene.add(enemy);
    enemies.push(enemy);
}

function getRandomTreasureScore() {
    const rand = Math.random();
    let cumulativeProb = 0;
    for (let i = 0; i < TREASURE_SCORES.length; i++) {
        cumulativeProb += TREASURE_PROBS[i];
        if (rand < cumulativeProb) {
            return TREASURE_SCORES[i];
        }
    }
    return TREASURE_SCORES[TREASURE_SCORES.length - 1]; // Fallback for floating point issues
}

function createTreasure(stairPosition) {
    if (!treasureModel) {
        console.warn("Treasure model not loaded yet, skipping treasure creation.");
        return;
    }

    const treasure = treasureModel.clone(); // Clone the full GLTF scene
    treasure.scale.set(0.003, 0.003, 0.003); 
    treasure.rotation.y = Math.PI; // Rotate 180 degrees around Y-axis

    // Animation Setup
    treasure.userData.mixer = null;
    treasure.userData.openAnimation = null;
    if (treasureModel.userData.animations && treasureModel.userData.animations.length > 0) {
        treasure.userData.mixer = new THREE.AnimationMixer(treasure);
        treasure.userData.openAnimation = treasureModel.userData.animations[0]; 
        if (!treasure.userData.openAnimation) {
            // console.warn("Could not find the 'Take 001' animation clip, though animations exist.");
        }
    } else {
        // console.log("No animations found on treasureModel to set up for this instance.");
    }
    treasure.userData.isOpening = false; // Flag to prevent re-triggering

    // --- Positioning Logic --- 
    treasure.position.copy(stairPosition);
    treasure.position.y += STAIR_HEIGHT / 2; 

    // You may need to fine-tune treasure.position.y further if the chest isn't sitting right on the stair.
    // For example, if the model's origin isn't at its visual base:
    // treasure.position.y -= ADJUSTMENT_FOR_MODEL_ORIGIN; 

    const modelVisualWidth = TREASURE_SIZE * 0.003 / 0.7; // Estimate based on old TREASURE_SIZE and new scale
                                                      // This is a rough guess, likely needs refinement.
                                                      // A better approach is to calculate bounding box of scaled model.
    const maxOffsetX = STAIR_WIDTH / 2 - modelVisualWidth / 2;
    const randomOffsetX = (Math.random() * 2 - 1) * maxOffsetX;
    treasure.position.x += randomOffsetX;

    scene.add(treasure);
    treasures.push(treasure); 

    // --- BoxHelper - REMOVED --- 
    // const boxHelper = new THREE.BoxHelper(treasure, 0xff0000); 
    // scene.add(boxHelper);
    // --- End BoxHelper ---
}

function resetGame() {
    baseScore = 0; // Reset base score
    treasureBonus = 0; // Reset treasure bonus
    velocityY = 0;
    onGround = false;
    keys.left = false;
    keys.right = false;
    keys.space = false;

    // Reset falling off side state
    isPlayerFallingOffSide = false;
    playerFallOffSideStartTime = 0;

    // Remove old player, stairs, enemies, and treasures
    if (player) scene.remove(player);
    stairs.forEach(stair => scene.remove(stair));
    enemies.forEach(enemy => scene.remove(enemy));
    treasures.forEach(treasure => scene.remove(treasure)); // Remove treasures from scene
    stairs = [];
    enemies = [];
    treasures = []; // Clear treasures array

    // Recreate
    createPlayer();
    createStairs();

    // Reset camera (Restored previous position)
    camera.position.set(
        player.position.x, 
        player.position.y + 4, // Restored Y offset
        player.position.z - 8  // Restored Z offset (was -5 before previous change, let's try -8)
    );
    camera.lookAt(player.position);

    // Score display is updated in startGame
}

function startGame() {
    console.log("Game Started!");
    gameStarted = true;
    gameOverOverlay.classList.add('hidden');
    startButton.classList.add('hidden');
    if(instructionCard) instructionCard.classList.add('hidden'); // Hide instruction card
    resetGame(); 
    clock.start();

    // Show and initialize score display for the new game
    if (scoreElement) {
        scoreElement.innerText = `Score: ${baseScore + treasureBonus}`; // Initial score is 0
        scoreElement.style.display = 'block';
    }

    animate();
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updatePlayer(dt) {
    if (!player) return;

    // If player is already in the "falling off side" sequence, only apply gravity and let them fall.
    if (isPlayerFallingOffSide) {
        velocityY += GRAVITY * dt; // Continue applying gravity
        player.position.y += velocityY * dt;
        // Horizontal momentum could also be preserved or dampened here if desired
        return; // Skip all other player logic (movement, collision, ground checks, other fall checks)
    }

    // --- Horizontal Movement ---
    if (keys.right) { 
        player.position.x -= PLAYER_SIDE_SPEED * dt;
    }
    if (keys.left) {
        player.position.x += PLAYER_SIDE_SPEED * dt;
    }

    // --- Automatic Forward Movement ---
    player.position.z += PLAYER_FORWARD_SPEED * dt;

    // --- Vertical Movement (Gravity) ---
    velocityY += GRAVITY * dt;
    player.position.y += velocityY * dt;

    // --- Collision Detection & Ground Check ---
    onGround = false;
    const playerBox = new THREE.Box3().setFromObject(player);

    let potentialGroundY = -Infinity; // Track the highest stair top the player is potentially landing on

    for (const stair of stairs) {
        const stairBox = new THREE.Box3().setFromObject(stair);

        // Check if player might be colliding (simple X/Z overlap check first)
        if (playerBox.max.x > stairBox.min.x && playerBox.min.x < stairBox.max.x &&
            playerBox.max.z > stairBox.min.z && playerBox.min.z < stairBox.max.z)
        {
            // Player is horizontally overlapping with this stair
            const playerBottom = player.position.y - PLAYER_SIZE / 2;
            const stairTop = stair.position.y + STAIR_HEIGHT / 2;
            const stairBottom = stair.position.y - STAIR_HEIGHT / 2;

            // Player might be landing if their bottom is near or below the stair top
            // And also above the bottom of the stair (to avoid collision when jumping up through it)
            if (playerBottom <= stairTop + 0.05 && playerBottom > stairBottom && velocityY <= 0) { // Added small tolerance (0.05)
                // console.log(`Collision check: PlayerBottom=${playerBottom.toFixed(2)}, StairTop=${stairTop.toFixed(2)}`); // Debug log
                potentialGroundY = Math.max(potentialGroundY, stairTop); // Keep track of the highest valid stair top
            }
        }
    }

    // After checking all stairs, determine if we landed
    if (potentialGroundY > -Infinity) {
        // console.log(`Landing detected! Snapping Y to ${potentialGroundY + PLAYER_SIZE / 2}`); // Debug log
        player.position.y = potentialGroundY + PLAYER_SIZE / 2; // Snap to the highest potential ground
        velocityY = 0;
        onGround = true;
    } else {
        // If no ground was detected beneath, ensure onGround is false
        onGround = false;
    }

    // --- Player-Enemy Collision Check ---
    const playerBoxCheck = new THREE.Box3().setFromObject(player);
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        // Using Box3 for now, sphere collision could be more accurate
        const enemyBox = new THREE.Box3().setFromObject(enemy); 
        if (playerBoxCheck.intersectsBox(enemyBox)) {
            console.log("Collided with enemy!");
            gameOver(); // Immediate game over for enemy collision
            return; // Stop player update
        }
    }

    // --- Player-Treasure Collision Check ---
    for (let i = treasures.length - 1; i >= 0; i--) {
        const treasure = treasures[i];
        // console.log("Checking collision with treasure:", treasure.uuid); // Log check
        const treasureBox = new THREE.Box3().setFromObject(treasure);

        if (playerBoxCheck.intersectsBox(treasureBox)) {
            // console.log("Collision DETECTED with treasure:", treasure.uuid, "isOpening:", treasure.userData.isOpening); // REMOVED
            if (treasure.userData.isOpening) continue; 

            const scoreValue = getRandomTreasureScore();
            // Don't add to score or show text immediately, wait for animation
            // treasureBonus += scoreValue; 
            // console.log(`Collected treasure! +${scoreValue} points (Bonus: ${treasureBonus})`);
            // const treasurePositionCopy = treasure.position.clone(); 
            // showFloatingScore(scoreValue, treasurePositionCopy);

            if (treasure.userData.mixer && treasure.userData.openAnimation) {
                treasure.userData.isOpening = true;
                // console.log("Playing treasure open animation for:", treasure.userData.openAnimation.name); // REMOVED
                const action = treasure.userData.mixer.clipAction(treasure.userData.openAnimation);
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
                action.timeScale = 10.0; // Speed up the animation 10x
                action.play();

                // Listen for animation to finish
                const onAnimationFinished = () => {
                    console.log("onAnimationFinished CALLBACK ENTERED for treasure:", treasure.uuid); // Log entry
                    console.log("Treasure animation finished.");
                    treasureBonus += scoreValue; // Add score after animation
                    updateScore(); // Manually update score display now
                    const treasurePositionCopy = treasure.position.clone(); 
                    showFloatingScore(scoreValue, treasurePositionCopy);

                    scene.remove(treasure);
                    const treasureIndex = treasures.indexOf(treasure); // Find index again, as it might have changed
                    if (treasureIndex > -1) {
                        treasures.splice(treasureIndex, 1);
                    }
                    treasure.userData.mixer.removeEventListener('finished', onAnimationFinished);
                };
                treasure.userData.mixer.addEventListener('finished', onAnimationFinished);
            } else {
                // No animation, collect immediately (fallback)
                treasureBonus += scoreValue;
                console.log(`Collected treasure (no anim)! +${scoreValue} points (Bonus: ${treasureBonus})`);
                const treasurePositionCopy = treasure.position.clone(); 
                showFloatingScore(scoreValue, treasurePositionCopy);
                scene.remove(treasure);
                treasures.splice(i, 1);
            }
            // No direct scoreElement update here, handled by updateScore or anim finish
            break; 
        }
    }

    // --- Jumping ---
    if (keys.space && onGround) {
        velocityY = JUMP_FORCE;
        onGround = false;
    }

    // --- Check Falling ---
    // Off the sides: Initiate the falling sequence
    if (Math.abs(player.position.x) > STAIR_WIDTH / 2 + PLAYER_SIZE / 2) {
        console.log("Player fell off side! Initiating delayed game over.");
        isPlayerFallingOffSide = true;
        playerFallOffSideStartTime = clock.getElapsedTime(); // Record start time of fall
        // Don't call gameOver() here; animate() will handle the timeout.
        // The early return at the top of this function will take over on subsequent frames.
        return; // Important to skip the "fell off back/down" check for this frame
    }

    // Off the bottom (this check is now only reached if not falling off the side)
    const expectedY = player.position.z * STAIR_INCLINE_FACTOR;
    if (player.position.y < expectedY - 10) { // Fell too far below expected path
        console.log("Fell off back/down!");
        gameOver();
        return;
    }
}

function updateCamera() {
     if (player) {
        // Direct follow logic
        camera.position.x = player.position.x * 0.5; 
        camera.position.y = player.position.y + 4; 
        camera.position.z = player.position.z - 8; 

        // Look slightly ahead of the player on the Z axis
        const lookAtTarget = new THREE.Vector3(
            player.position.x, 
            player.position.y, // Look at player's height
            player.position.z + 5 // Look 5 units ahead of the player
        );
        camera.lookAt(lookAtTarget);
    }
}

function updateStairsAndEnemies() {
    if (!player || stairs.length === 0) return;

    const firstStair = stairs[0];
    const lastStair = stairs[stairs.length - 1];
    // --- Recycle stairs --- 
    // Recycle when player is 10 steps past the first stair
    const recycleThreshold = firstStair.position.z + STAIR_DEPTH * 10;

    // Keep checking and recycling stairs as long as the player is past the threshold
    while (stairs.length > 0 && player.position.z > stairs[0].position.z + STAIR_DEPTH * 10) {
        const recycledStair = stairs.shift(); // Remove from beginning
        recycledStair.position.z = stairs[stairs.length - 1].position.z + STAIR_DEPTH; // Use last stair in current array
        recycledStair.position.y = recycledStair.position.z * STAIR_INCLINE_FACTOR;
        stairs.push(recycledStair); // Add to end

        // Chance to spawn an enemy on the recycled stair
        if (Math.random() < ENEMY_SPAWN_CHANCE) {
            createEnemy(recycledStair.position); 
        }
        // Chance to spawn a treasure on the recycled stair
        if (Math.random() < TREASURE_SPAWN_CHANCE) {
             createTreasure(recycledStair.position);
        }
    }

    // --- Despawn ONLY treasures here --- 
    const despawnThresholdZ = player.position.z - (STAIR_DEPTH * 10) - 20;
    // Treasures
     for (let i = treasures.length - 1; i >= 0; i--) {
        const treasure = treasures[i];
        if (treasure.position.z < despawnThresholdZ) {
            scene.remove(treasure);
            treasures.splice(i, 1);
        }
    }
    // Enemy despawning moved to updateEnemies
}

function updateEnemies(dt) {
    if (!player) return;
    const despawnThresholdZ = player.position.z - (STAIR_DEPTH * 10) - 20;

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const data = enemy.userData;

        // --- Despawn Check ---
        if (enemy.position.z < despawnThresholdZ) {
            scene.remove(enemy);
            enemies.splice(i, 1);
            continue; // Go to next enemy
        }

        // --- Apply Physics ---
        // Gravity
        data.velocityY += GRAVITY * dt;
        enemy.position.y += data.velocityY * dt;

        // Rolling Acceleration (down stairs -Z)
        data.velocityZ += ENEMY_ROLL_ACCEL * dt;
        data.velocityZ = Math.max(ENEMY_MAX_ROLL_SPEED, data.velocityZ); 
        enemy.position.z += data.velocityZ * dt;

        // --- Ground Check (Stairs and Treasures) ---
        data.onGround = false;
        const enemySphereBottom = enemy.position.y - data.radius;
        let potentialGroundY = -Infinity;

        // Check against Treasures
        for (const treasure of treasures) {
            if (treasure.userData.isOpening) continue; // Skip opening/opened treasures for collision

            const treasureBox = new THREE.Box3().setFromObject(treasure);
            // Check XZ overlap: enemy sphere must overlap treasure's XZ footprint
            if (enemy.position.x + data.radius > treasureBox.min.x && 
                enemy.position.x - data.radius < treasureBox.max.x &&
                enemy.position.z + data.radius > treasureBox.min.z && // Consider enemy radius for Z overlap too
                enemy.position.z - data.radius < treasureBox.max.z) {

                // If enemy is falling (velocityY <= 0) and its bottom is near or below treasure top
                if (data.velocityY <= 0 && enemySphereBottom <= treasureBox.max.y + 0.05) { // Small tolerance
                    potentialGroundY = Math.max(potentialGroundY, treasureBox.max.y);
                }
            }
        }

        // Check against Stairs
        for (const stair of stairs) {
            // Basic proximity check first (simplified XZ overlap for stairs)
             if (Math.abs(enemy.position.z - stair.position.z) < STAIR_DEPTH * 0.5 + data.radius &&  // Enemy center Z near stair center Z +- half depth + radius
                Math.abs(enemy.position.x - stair.position.x) < STAIR_WIDTH / 2 + data.radius) { // Enemy sphere X overlaps stair width
                
                const stairTop = stair.position.y + STAIR_HEIGHT / 2;
                // Check if sphere bottom is near or below stair top and enemy is falling
                if (data.velocityY <= 0 && enemySphereBottom <= stairTop + 0.05) {
                    potentialGroundY = Math.max(potentialGroundY, stairTop);
                }
            }
        }

        // Resolve landing on the highest detected surface
        if (potentialGroundY > -Infinity) {
            enemy.position.y = potentialGroundY + data.radius; // Snap to highest ground + radius
            data.velocityY = 0;
            data.onGround = true;
        } else {
            data.onGround = false; // Still falling
        }

        // --- Visual Rotation ---
        const distanceMoved = data.velocityZ * dt;
        const circumference = 2 * Math.PI * data.radius;
        const rotationAngle = (distanceMoved / circumference) * 2 * Math.PI;
        enemy.rotation.x += rotationAngle * ENEMY_ROTATION_SPEED;
    }
}

function updateScore() {
    // Don't update score if player doesn't exist, score element missing, game not started, or player is falling off side
    if (!player || !scoreElement || !gameStarted || isPlayerFallingOffSide) return;
    
    // Calculate score based purely on climbing distance
    const currentClimbingScore = Math.max(0, Math.floor(player.position.z / STAIR_DEPTH));
    
    // Update the base score if player has climbed higher
    baseScore = Math.max(baseScore, currentClimbingScore); 
    
    // Always update the display to show the current total score
    const totalScore = baseScore + treasureBonus;
    scoreElement.innerText = `Score: ${totalScore}`;
}

function gameOver() {
    const finalScore = baseScore + treasureBonus;
    console.log(`Game Over! Final Score: ${finalScore}`);
    gameStarted = false;
    clock.stop();

    if (scoreElement) scoreElement.style.display = 'none'; 
    finalScoreTextElement.innerText = `Final Score: ${finalScore}`; // Display combined score
    
    playAgainButton.classList.add('hidden'); 
    gameOverOverlay.classList.remove('hidden'); 

    setTimeout(() => {
        if (!gameStarted) { 
           playAgainButton.classList.remove('hidden'); 
        }
    }, 2000); 

    // Optional: Stop player movement immediately
    if(player) {
       // ...
    }
}

function animate() {
    const dt = clock.getDelta();

    if (isPlayerFallingOffSide) {
        // Check if the game is still considered "started" (i.e., gameOver hasn't been called by this fall sequence yet)
        // and if the fall duration has exceeded the timeout.
        if (gameStarted && (clock.getElapsedTime() - playerFallOffSideStartTime > 1.5)) {
            console.log("Player side fall timeout reached. Calling Game Over.");
            gameOver(); // This will set gameStarted = false
        }
    }

    // If game is truly over (gameStarted is false) AND we are NOT in the special falling off side sequence, then stop animating.
    if (!gameStarted && !isPlayerFallingOffSide) {
        return; // Stop the animation loop
    }

    requestAnimationFrame(animate);

    updatePlayer(dt); // updatePlayer will handle the falling physics if isPlayerFallingOffSide is true

    // Only run full game logic updates if gameStarted is true.
    // If isPlayerFallingOffSide is true, gameStarted will become false after the timeout (via gameOver).
    // Before that timeout, gameStarted remains true, but updatePlayer has an early exit for most logic.
    if (gameStarted) {
        updateStairsAndEnemies();
        updateEnemies(dt);
        // updateScore(); // Score is now handled with a check inside updateScore itself
    }

    updateScore(); // updateScore now has an internal check for gameStarted and isPlayerFallingOffSide
    updateCamera(); // Camera always updates to follow the player, even during a fall

    // Update animation mixers for treasures
    treasures.forEach(treasure => {
        if (treasure.userData.mixer) {
            treasure.userData.mixer.update(dt);
        }
    });

    renderer.render(scene, camera);
}

function showFloatingScore(value, position3D) {
    if (!floatingTextContainer) return;

    const textElement = document.createElement('div');
    textElement.className = 'floating-score';
    textElement.innerText = `+${value}`;

    // Convert 3D position to 2D screen coordinates
    // const tempV = new THREE.Vector3(); // Don't actually need tempV here
    position3D.project(camera); // Project vector in place

    const x = (position3D.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (position3D.y * -0.5 + 0.5) * canvas.clientHeight;

    textElement.style.left = `${x}px`;
    textElement.style.top = `${y}px`;
    // Small offset so it doesn't start exactly on the collision point
    textElement.style.transform = 'translate(-50%, -100%)'; 

    floatingTextContainer.appendChild(textElement);

    // Remove the element after animation completes (1s)
    setTimeout(() => {
        if (textElement.parentNode === floatingTextContainer) {
             floatingTextContainer.removeChild(textElement);
        }
    }, 1000);
}

// --- Input Handlers ---
function handleKeyDown(event) {
    switch (event.code) {
        case 'KeyA':
        case 'ArrowLeft': keys.left = true; break;
        case 'KeyD':
        case 'ArrowRight': keys.right = true; break;
        case 'Space':
            if (!gameStarted) {
                if (!startButton.classList.contains('hidden') || !playAgainButton.classList.contains('hidden')) {
                   event.preventDefault(); 
                   startGame();
                }
            } else {
                keys.space = true;
            }
            break;
    }
}

function handleKeyUp(event) {
    switch (event.code) {
        case 'KeyA':
        case 'ArrowLeft': keys.left = false; break;
        case 'KeyD':
        case 'ArrowRight': keys.right = false; break;
        case 'Space': keys.space = false; break;
    }
}

function handleTouchStart(event) {
    event.preventDefault(); // Prevent potential browser actions like scrolling
    if (event.touches.length === 0) return;
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    // Reset keys that might be triggered by touch end
    keys.space = false;
    keys.left = false;
    keys.right = false;
}

function handleTouchMove(event) {
    event.preventDefault(); // Prevent scrolling during swipe attempt
    // We don't need to do much here, just prevent default.
    // Logic happens in touchend based on start/end points.
}

function handleTouchEnd(event) {
    event.preventDefault();
    if (touchStartX === 0) return; // No corresponding touchstart

    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - touchStartTime;

    // Use changedTouches to get the end position of the touch that was lifted
    if (event.changedTouches.length === 0) return;
    const touch = event.changedTouches[0];
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // --- Determine Action: Tap or Swipe ---
    if (touchDuration < TAP_THRESHOLD_TIME && 
        Math.abs(deltaX) < TAP_THRESHOLD_DIST && 
        Math.abs(deltaY) < TAP_THRESHOLD_DIST)
    { 
        // TAP -> Jump (or Start/Restart if applicable)
        console.log("Tap detected");
        if (!gameStarted) {
             if (!startButton.classList.contains('hidden') || !playAgainButton.classList.contains('hidden')) {
                 startGame();
             }
        } else {
             keys.space = true;
             // Reset space after a short delay to mimic key press
             setTimeout(() => { keys.space = false; }, 100);
        }
    }
     else if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        // HORIZONTAL SWIPE -> Left/Right
        if (deltaX < 0) {
            // Swipe Left
            console.log("Swipe Left detected");
            keys.left = true;
            // Reset key after short delay
            setTimeout(() => { keys.left = false; }, 75); // Adjust delay as needed
        } else {
            // Swipe Right
            console.log("Swipe Right detected");
            keys.right = true;
             // Reset key after short delay
            setTimeout(() => { keys.right = false; }, 75);
        }
    }
    // else: Vertical swipe or insignificant movement - do nothing

    // Reset start points
    touchStartX = 0;
    touchStartY = 0;
    touchStartTime = 0;
}

// Initialize Three.js setup but don't start the game loop yet
init();