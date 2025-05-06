import * as THREE from 'three';

let scene, camera, renderer;
let player, stairs = [];
let enemies = []; // Array to hold enemy objects
let treasures = []; // Array to hold treasure objects
let gameStarted = false;
let baseScore = 0; // Score from climbing
let treasureBonus = 0; // Score from treasures
let clock = new THREE.Clock(); // Clock for delta time

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
    const geometry = new THREE.BoxGeometry(TREASURE_SIZE, TREASURE_SIZE, TREASURE_SIZE);
    const material = new THREE.MeshLambertMaterial({ color: TREASURE_COLOR });
    const treasure = new THREE.Mesh(geometry, material);

    // Randomize X position
    const maxOffsetX = STAIR_WIDTH / 2 - TREASURE_SIZE / 2;
    const randomOffsetX = (Math.random() * 2 - 1) * maxOffsetX;

    treasure.position.copy(stairPosition);
    treasure.position.x += randomOffsetX;
    treasure.position.y += STAIR_HEIGHT / 2 + TREASURE_SIZE / 2; // Place on top of stair
    treasure.geometry.computeBoundingBox();

    scene.add(treasure);
    treasures.push(treasure);
}

function resetGame() {
    baseScore = 0; // Reset base score
    treasureBonus = 0; // Reset treasure bonus
    velocityY = 0;
    onGround = false;
    keys.left = false;
    keys.right = false;
    keys.space = false;

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

    // --- Horizontal Movement (Corrected + Logging) ---
    if (keys.right) {
        const changeX = -PLAYER_SIDE_SPEED * dt;
        player.position.x += changeX;
         console.log("Key LEFT pressed, changing X by:", changeX); // Debug log
    }
    if (keys.left) {
        const changeX = PLAYER_SIDE_SPEED * dt;
        player.position.x += changeX;
         console.log("Key RIGHT pressed, changing X by:", changeX); // Debug log
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
            gameOver();
            return; // Stop player update
        }
    }

    // --- Player-Treasure Collision Check ---
    for (let i = treasures.length - 1; i >= 0; i--) {
        const treasure = treasures[i];
        const treasureBox = new THREE.Box3().setFromObject(treasure);

        if (playerBoxCheck.intersectsBox(treasureBox)) {
            const scoreValue = getRandomTreasureScore();
            treasureBonus += scoreValue; // Add to treasure bonus
            console.log(`Collected treasure! +${scoreValue} points (Bonus: ${treasureBonus})`);

            const treasurePositionCopy = treasure.position.clone(); 
            showFloatingScore(scoreValue, treasurePositionCopy);

            scene.remove(treasure);
            treasures.splice(i, 1);
            // No direct scoreElement update here, handled by updateScore
            break; 
        }
    }

    // --- Jumping ---
    if (keys.space && onGround) {
        velocityY = JUMP_FORCE;
        onGround = false;
    }

    // --- Check Falling ---
    // Off the sides
    if (Math.abs(player.position.x) > STAIR_WIDTH / 2 + PLAYER_SIZE / 2) {
         console.log("Fell off side!");
         gameOver();
         return; // Stop further updates this frame
    }
    // Off the bottom (compare with the lowest possible stair Y based on Z)
    // Simplified: Check if player is way below their expected Y based on Z
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
        // Clamp speed
        data.velocityZ = Math.max(ENEMY_MAX_ROLL_SPEED, data.velocityZ); 
        enemy.position.z += data.velocityZ * dt;

        // Simple Ground Check (similar to player, checking against stairs)
        data.onGround = false;
        const enemySphereBottom = enemy.position.y - data.radius;
        let potentialGroundY = -Infinity;

        for (const stair of stairs) {
            // Basic proximity check first (simplified)
             if (Math.abs(enemy.position.z - stair.position.z) < STAIR_DEPTH * 1.5 && 
                Math.abs(enemy.position.x - stair.position.x) < STAIR_WIDTH / 2 + data.radius)
             {
                const stairTop = stair.position.y + STAIR_HEIGHT / 2;
                // Check if sphere bottom is near or below stair top
                if (enemySphereBottom <= stairTop + 0.05 && data.velocityY <= 0) {
                    potentialGroundY = Math.max(potentialGroundY, stairTop);
                }
            }
        }

        if (potentialGroundY > -Infinity) {
            enemy.position.y = potentialGroundY + data.radius; // Snap to highest ground
            data.velocityY = 0;
            data.onGround = true;
        } else {
            data.onGround = false;
        }

        // --- Visual Rotation ---
        // Rotate based on Z movement, around the X axis
        const distanceMoved = data.velocityZ * dt;
        const circumference = 2 * Math.PI * data.radius;
        const rotationAngle = (distanceMoved / circumference) * 2 * Math.PI;
        enemy.rotation.x += rotationAngle * ENEMY_ROTATION_SPEED;
    }
}

function updateScore() {
    if (!player || !scoreElement) return;
    
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
    if (!gameStarted) return;
    const dt = clock.getDelta();
    requestAnimationFrame(animate);

    updatePlayer(dt);
    if (!gameStarted) return; 

    updateStairsAndEnemies(); 
    updateEnemies(dt); // Add call to update enemies
    updateCamera();
    updateScore();

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
            setTimeout(() => { keys.left = false; }, 150); // Adjust delay as needed
        } else {
            // Swipe Right
            console.log("Swipe Right detected");
            keys.right = true;
             // Reset key after short delay
            setTimeout(() => { keys.right = false; }, 150);
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