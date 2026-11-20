import { Injectable } from '@angular/core';
import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

@Injectable({
  providedIn: 'root'
})
export class Game {
  private canvas!: HTMLCanvasElement;
  private engine!: BABYLON.Engine;
  private scene!: BABYLON.Scene;
  private camera!: BABYLON.UniversalCamera;
  private readonly enemies: EnemyMesh[] = [];
  private readonly lasers: LaserMesh[] = [];
  private readonly enemyProjectiles: EnemyProjectile[] = [];
  private readonly powerUps: PowerUpMesh[] = [];
  private readonly fragments: BABYLON.Mesh[] = [];
  private keys: KeyState = {};
  private fireIntervalId: any = null;
  private readonly laserLength: number = 4;
  private health: number = 100;
  private readonly maxHealth: number = 100;
  private shield: number = 50;
  private readonly maxShield: number = 50;
  private score: number = 0;
  private isGameOver: boolean = false;
  private healthText!: GUI.TextBlock;
  private shieldText!: GUI.TextBlock;
  private scoreText!: GUI.TextBlock;
  private gameOverText!: GUI.TextBlock;
  private lastHealthRegenTime: number = 0;
  private lastShieldRegenTime: number = 0;
  private readonly fireRate: number = 150; // Default fire rate in ms
  private fireRateBoostEndTime: number = 0;
  private shieldBoostEndTime: number = 0;
  private maxShieldBoost: number = 0;

  initialize(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new BABYLON.Engine(this.canvas, true);
    this.scene = this.createScene();
    this.setupEventListeners();
    this.startGameLoop();
    
    // Initialize regeneration timers
    this.lastHealthRegenTime = performance.now();
    this.lastShieldRegenTime = performance.now();
  }

  private createScene(): BABYLON.Scene {
    const scene = new BABYLON.Scene(this.engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

    // Place camera far enough to see the system
    // Camera will be offset on Z axis, looking at the Sun
    this.camera = new BABYLON.UniversalCamera(
      "camera",
      new BABYLON.Vector3(0, 0, -10000), // Move camera farther back
      scene
    );
    this.camera.setTarget(BABYLON.Vector3.Zero());
    this.camera.maxZ = 50000; // Increase far clipping plane
    this.camera.attachControl(this.canvas, true);
    this.camera.inertia = 0.8;
    this.camera.angularSensibility = 3000;
    const mouseInput = this.camera.inputs.attached["mouse"] as BABYLON.FreeCameraMouseInput;
    mouseInput.buttons = [];

    // Pointer lock on click
    this.canvas.addEventListener("click", () => {
      this.canvas.requestPointerLock?.();
    });

    // Setup lighting
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

    // Create starfield background
    this.createStarfield(scene);

    // Create planets
    this.createPlanets(scene);

    // Start enemy spawning
    this.startEnemySpawning();

    // Start power-up spawning
    this.startPowerUpSpawning();

    // Add Babylon.js GUI crosshair
    const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);

    // Create health UI
    this.createHealthUI(advancedTexture);

    // Create a simple crosshair using two lines
    const crosshairLength = 20;
    const crosshairThickness = 2;
    const color = "white";

    // Vertical line
    const vLine = new GUI.Rectangle();
    vLine.width = `${crosshairThickness}px`;
    vLine.height = `${crosshairLength}px`;
    vLine.color = color;
    vLine.thickness = 0;
    vLine.background = color;
    vLine.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    vLine.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    advancedTexture.addControl(vLine);

    // Horizontal line
    const hLine = new GUI.Rectangle();
    hLine.width = `${crosshairLength}px`;
    hLine.height = `${crosshairThickness}px`;
    hLine.color = color;
    hLine.thickness = 0;
    hLine.background = color;
    hLine.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    hLine.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    advancedTexture.addControl(hLine);

    // Add glow layer for emissive objects (like the Sun)
    const _glowLayer = new BABYLON.GlowLayer("glow", scene);
    _glowLayer.intensity = 1.5;

    // Setup render loop logic
    scene.onBeforeRenderObservable.add(() => this.updateGame());

    return scene;
  }

  private createStarfield(scene: BABYLON.Scene): void {
    const starCount = 2000;
    for (let i = 0; i < starCount; i++) {
      const diameter = 0.5 + Math.random() * 2;
      const star = BABYLON.MeshBuilder.CreateSphere("star", { diameter }, scene);
      star.position = new BABYLON.Vector3(
        (Math.random() - 0.5) * 10000,
        (Math.random() - 0.5) * 10000,
        (Math.random() - 0.5) * 10000
      );
      const mat = new BABYLON.StandardMaterial("starMat", scene);
      mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
      mat.disableLighting = true;
      star.material = mat;
      star.isPickable = false;
    }
  }

  private createPlanet(textureUrl: string, position: BABYLON.Vector3, size: number, scene: BABYLON.Scene): BABYLON.Mesh {
    const planet = BABYLON.MeshBuilder.CreateSphere("planet", { diameter: size }, scene);
    planet.position = position;

    const material = new BABYLON.StandardMaterial("planetMat", scene);
    material.diffuseTexture = new BABYLON.Texture(textureUrl, scene);

    // Make the Sun emissive
    if (textureUrl.includes("sun")) {
      material.emissiveColor = new BABYLON.Color3(1, 0.8, 0.2); // Bright yellowish
    }

    planet.material = material;
    return planet;
  }

  private createPlanets(scene: BABYLON.Scene): void {
    // Realistic values (km)
    const sunDiameter = 1391000;
    const earthDiameter = 12742;
    const marsDiameter = 6779;
    const venusDiameter = 12104;

    // Realistic average distances from Sun (km)
    const earthDist = 149_600_000;
    const marsDist = 227_900_000;
    const venusDist = 108_200_000;

    // Scaled diameters and distances
    const sizeScale = 0.005;       // 1 unit = 200 km
    const distanceScale = 0.00005; // 1 unit = 20,000 km

    const planetConfigs = [
      { texture: "textures/planets/2k_sun.jpg", size: sunDiameter * sizeScale, position: new BABYLON.Vector3(0, 0, 0) }, // Sun at origin
      { texture: "textures/planets/2k_earth_daymap.jpg", size: earthDiameter * sizeScale, position: new BABYLON.Vector3(earthDist * distanceScale, 0, 0) },
      { texture: "textures/planets/2k_mars.jpg", size: marsDiameter * sizeScale, position: new BABYLON.Vector3(marsDist * distanceScale, 0, 0) },
      { texture: "textures/planets/2k_venus_surface.jpg", size: venusDiameter * sizeScale, position: new BABYLON.Vector3(venusDist * distanceScale, 0, 0) }
    ];

    for (const config of planetConfigs) {
      this.createPlanet(config.texture, config.position, config.size, scene);
    }
  }

  private createHealthUI(advancedTexture: GUI.AdvancedDynamicTexture): void {
    // Health text
    this.healthText = new GUI.TextBlock();
    this.healthText.text = `Health: ${this.health}/${this.maxHealth}`;
    this.healthText.color = "white";
    this.healthText.fontSize = 24;
    this.healthText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.healthText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.healthText.paddingLeft = "0px";
    this.healthText.paddingTop = "0px";
    this.healthText.left = "20px";
    this.healthText.top = "20px";
    this.healthText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.healthText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.healthText.width = "300px";
    this.healthText.height = "50px";
    advancedTexture.addControl(this.healthText);

    // Shield text - using absolute positioning
    this.shieldText = new GUI.TextBlock();
    this.shieldText.text = `Shield: ${this.shield}/${this.maxShield}`;
    this.shieldText.color = "yellow";
    this.shieldText.fontSize = 24;
    this.shieldText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.shieldText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.shieldText.paddingLeft = "0px";
    this.shieldText.paddingTop = "0px";
    this.shieldText.left = "20px";
    this.shieldText.top = "50px";
    this.shieldText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.shieldText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.shieldText.width = "300px";
    this.shieldText.height = "50px";
    advancedTexture.addControl(this.shieldText);

    // Score text
    this.scoreText = new GUI.TextBlock();
    this.scoreText.text = `Score: ${this.score}`;
    this.scoreText.color = "cyan";
    this.scoreText.fontSize = 24;
    this.scoreText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.scoreText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.scoreText.paddingLeft = "0px";
    this.scoreText.paddingTop = "0px";
    this.scoreText.left = "20px";
    this.scoreText.top = "80px";
    this.scoreText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.scoreText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.scoreText.width = "300px";
    this.scoreText.height = "50px";
    advancedTexture.addControl(this.scoreText);

    // Game over text (initially hidden)
    this.gameOverText = new GUI.TextBlock();
    this.gameOverText.text = "GAME OVER\nPress R to restart";
    this.gameOverText.color = "red";
    this.gameOverText.fontSize = 48;
    this.gameOverText.fontWeight = "bold";
    this.gameOverText.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.gameOverText.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    this.gameOverText.isVisible = false;
    advancedTexture.addControl(this.gameOverText);
  }

  private spawnEnemy(): void {
    const enemy = BABYLON.MeshBuilder.CreateBox("enemy", { width: 1, height: 1, depth: 1 }, this.scene) as EnemyMesh;

    // Pick a random spaceship texture (1.png to 13.png)
    const textureIndex = 1 + Math.floor(Math.random() * 13);
    const texturePath = `textures/spaceships/${textureIndex}.png`;

    const material = new BABYLON.StandardMaterial("enemyMat", this.scene);
    material.diffuseTexture = new BABYLON.Texture(texturePath, this.scene);
    material.diffuseTexture.hasAlpha = true; // If PNGs have transparency
    material.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Optional: make ships a bit more visible
    enemy.material = material;

    // 30% chance for enemy to have shooting ability
    enemy._canShoot = Math.random() < 0.3;
    enemy._lastShotTime = 0;
    enemy._shootCooldown = 2000 + Math.random() * 1000; // 2-3 seconds between shots
    
    // Make shooting enemies slightly more visible with a red tint
    if (enemy._canShoot) {
      material.emissiveColor = new BABYLON.Color3(0.4, 0.1, 0.1); // Reddish tint
    }

    // Spawn randomly in a sphere around the player, at a distance of 80-120 units
    const distance = 80 + Math.random() * 40;
    const theta = Math.random() * 2 * Math.PI; // azimuthal angle
    const phi = Math.acos(2 * Math.random() - 1); // polar angle

    const x = this.camera.position.x + distance * Math.sin(phi) * Math.cos(theta);
    const y = this.camera.position.y + distance * Math.sin(phi) * Math.sin(theta);
    const z = this.camera.position.z + distance * Math.cos(phi);

    enemy.position = new BABYLON.Vector3(x, y, z);
    this.enemies.push(enemy);
  }

  private startEnemySpawning(): void {
    setInterval(() => this.spawnEnemy(), 1500);
  }

  private startPowerUpSpawning(): void {
    setInterval(() => this.spawnPowerUp(), 8000); // Power-up every 8 seconds
  }

  private spawnPowerUp(): void {
    const powerUp = BABYLON.MeshBuilder.CreateSphere("powerUp", { diameter: 1.5 }, this.scene) as PowerUpMesh;

    // Random power-up type
    const types: ('health' | 'shield' | 'fireRate' | 'shieldBoost')[] = ['health', 'shield', 'fireRate', 'shieldBoost'];
    powerUp._type = types[Math.floor(Math.random() * types.length)];
    powerUp._bobOffset = Math.random() * Math.PI * 2; // Random bob animation offset

    const material = new BABYLON.StandardMaterial("powerUpMat", this.scene);
    
    // Different colors for different power-up types
    switch (powerUp._type) {
      case 'health':
        material.emissiveColor = new BABYLON.Color3(0, 1, 0); // Green
        break;
      case 'shield':
        material.emissiveColor = new BABYLON.Color3(0, 0.8, 1); // Light blue
        break;
      case 'fireRate':
        material.emissiveColor = new BABYLON.Color3(1, 0.5, 0); // Orange
        break;
      case 'shieldBoost':
        material.emissiveColor = new BABYLON.Color3(1, 0, 1); // Magenta
        break;
    }
    
    material.alpha = 0.8;
    powerUp.material = material;

    // Spawn at a random position around the player, closer than enemies
    const distance = 30 + Math.random() * 20; // 30-50 units from player
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = this.camera.position.x + distance * Math.sin(phi) * Math.cos(theta);
    const y = this.camera.position.y + distance * Math.sin(phi) * Math.sin(theta);
    const z = this.camera.position.z + distance * Math.cos(phi);

    powerUp.position = new BABYLON.Vector3(x, y, z);
    this.powerUps.push(powerUp);
  }

  private fireLaser(): void {
    const laser = BABYLON.MeshBuilder.CreateCylinder("laser", {
      height: this.laserLength * 1.5,      // Make the laser longer
      diameterTop: 0.15,                   // Make the laser thicker
      diameterBottom: 0.15,                // Make the laser thicker
      tessellation: 12                     // Smoother cylinder
    }, this.scene) as LaserMesh;

    const material = new BABYLON.StandardMaterial("laserMat", this.scene);
    material.emissiveColor = new BABYLON.Color3(1, 0, 0); // Bright red
    material.alpha = 1; // Ensure fully opaque for best glow
    laser.material = material;

    // Position the laser in front of the camera
    laser.position = this.camera.position.add(this.camera.getDirection(BABYLON.Axis.Z).scale(this.laserLength / 2 + 1));
    laser.rotation = this.camera.rotation.clone();
    laser.rotation.x += Math.PI / 2; // Align with Z axis

    laser._direction = this.camera.getDirection(BABYLON.Axis.Z).clone();
    laser._alive = true;
    this.lasers.push(laser);
  }

  private enemyShoot(enemy: EnemyMesh): void {
    const projectile = BABYLON.MeshBuilder.CreateSphere("enemyProjectile", { diameter: 0.4 }, this.scene) as EnemyProjectile;
    
    const material = new BABYLON.StandardMaterial("enemyProjectileMat", this.scene);
    material.emissiveColor = new BABYLON.Color3(1, 0.5, 0); // Orange color
    material.alpha = 0.8;
    projectile.material = material;

    // Position projectile at enemy location
    projectile.position = enemy.position.clone();
    
    // Calculate direction toward player
    projectile._direction = this.camera.position.subtract(enemy.position).normalize();
    projectile._speed = 0.8; // Slower than player movement speed
    projectile._alive = true;
    
    this.enemyProjectiles.push(projectile);
  }

  private updateEnemyProjectiles(): void {
    this.enemyProjectiles.forEach((projectile, projectileIndex) => {
      if (projectile._alive) {
        // Move projectile toward player
        projectile.position.addInPlace(projectile._direction.scale(projectile._speed));

        // Check collision with player
        const distanceToPlayer = BABYLON.Vector3.Distance(projectile.position, this.camera.position);
        if (distanceToPlayer < 2) { // Player collision radius
          this.takeDamage(15); // Less damage than direct enemy collision
          projectile.dispose();
          this.enemyProjectiles.splice(projectileIndex, 1);
          return;
        }

        // Remove projectile if it's too far from player (cleanup)
        if (distanceToPlayer > 200) {
          projectile.dispose();
          this.enemyProjectiles.splice(projectileIndex, 1);
        }

        // Check collision with player's lasers
        this.lasers.forEach((laser, laserIndex) => {
          if (laser.intersectsMesh(projectile, false)) {
            // Destroy both projectile and laser
            projectile.dispose();
            laser.dispose();
            this.enemyProjectiles.splice(projectileIndex, 1);
            this.lasers.splice(laserIndex, 1);
          }
        });

        // Check collision with other enemies (friendly fire)
        this.enemies.forEach((enemy, enemyIndex) => {
          if (enemy.intersectsMesh(projectile, false)) {
            // Enemy hit by friendly fire - destroy both
            this.explodeEnemy(enemy);
            this.addScore(75); // 75 points for friendly fire kill
            projectile.dispose();
            this.enemies.splice(enemyIndex, 1);
            this.enemyProjectiles.splice(projectileIndex, 1);
            enemy.dispose();
          }
        });
      }
    });
  }

  private updateGame(): void {
    if (this.isGameOver) return; // Don't update if game is over

    const delta = this.engine.getDeltaTime() / 1000;
    const currentTime = performance.now();
    
    this.handlePlayerMovement(delta);
    this.updateLasers();
    this.updateEnemies();
    this.updateEnemyProjectiles();
    this.updatePowerUps();
    this.updatePowerUpEffects(currentTime);
    this.updateHealth(currentTime);
  }

  private handlePlayerMovement(delta: number): void {
    const speed = 10;
    const forward = this.camera.getDirection(BABYLON.Axis.Z).scale(speed * delta);
    const right = this.camera.getDirection(BABYLON.Axis.X).scale(speed * delta);
    const up = this.camera.getDirection(BABYLON.Axis.Y).scale(speed * delta);

    if (this.keys['w']) this.camera.position.addInPlace(forward);
    if (this.keys['s']) this.camera.position.subtractInPlace(forward);
    if (this.keys['a']) this.camera.position.subtractInPlace(right);
    if (this.keys['d']) this.camera.position.addInPlace(right);
    if (this.keys[' ']) this.camera.position.addInPlace(up);
    if (this.keys['Shift']) this.camera.position.subtractInPlace(up);
  }

  private updateLasers(): void {
    this.lasers.forEach((laser, laserIndex) => {
      if (laser._alive) {
        laser.position.addInPlace(laser._direction.scale(2));

        // Check collision with enemies
        this.enemies.forEach((enemy, enemyIndex) => {
          if (laser.intersectsMesh(enemy, false)) {
            this.explodeEnemy(enemy);
            this.addScore(100); // 100 points for laser kill
            enemy.dispose();
            this.enemies.splice(enemyIndex, 1);
            laser.dispose();
            this.lasers.splice(laserIndex, 1);
          }
        });
      }
    });
  }

  private updateEnemies(): void {
    const currentTime = performance.now();
    
    this.enemies.forEach((enemy, enemyIndex) => {
      // Move enemy toward player
      const direction = this.camera.position.subtract(enemy.position).normalize();
      enemy.position.addInPlace(direction.scale(0.1));

      // Enemy shooting logic
      if (enemy._canShoot && currentTime - enemy._lastShotTime > enemy._shootCooldown) {
        const distanceToPlayer = BABYLON.Vector3.Distance(enemy.position, this.camera.position);
        // Only shoot if player is within range and not too close
        if (distanceToPlayer < 100 && distanceToPlayer > 10) {
          this.enemyShoot(enemy);
          enemy._lastShotTime = currentTime;
        }
      }

      // Check collision with player (camera)
      const playerRadius = 1; // Adjust as needed for your camera/player size
      if (BABYLON.Vector3.Distance(enemy.position, this.camera.position) < playerRadius + 0.5) {
        this.takeDamage(20); // Player takes 20 damage
        this.explodeEnemy(enemy);
        this.addScore(50); // 50 points for ramming kill (less than laser)
        this.enemies.splice(enemyIndex, 1);
        enemy.dispose();
        return; // Skip further checks for this enemy
      }

      if (this.checkCollisionWithPlanets(enemy, enemyIndex)) return;
      if (this.checkCollisionWithFragments(enemy, enemyIndex)) return;
      if (this.checkCollisionWithOtherEnemies(enemy, enemyIndex)) return;
    });

    // Clean up disposed fragments from the array
    this.fragments.forEach((fragment, i) => {
      if (fragment.isDisposed()) {
        this.fragments.splice(i, 1);
      }
    });
  }

  private checkCollisionWithPlanets(enemy: BABYLON.Mesh, enemyIndex: number): boolean {
    for (const mesh of this.scene.meshes) {
      if (
        mesh.name === "planet" &&
        BABYLON.Vector3.Distance(enemy.position, mesh.position) < (mesh.getBoundingInfo().boundingSphere.radius + 0.5)
      ) {
        this.explodeEnemy(enemy);
        this.enemies.splice(enemyIndex, 1);
        enemy.dispose();
        return true;
      }
    }
    return false;
  }

  private checkCollisionWithFragments(enemy: BABYLON.Mesh, enemyIndex: number): boolean {
    for (const fragment of this.fragments) {
      if (
        fragment &&
        BABYLON.Vector3.Distance(enemy.position, fragment.position) < 0.6 // 0.3 (fragment size) + 0.3 (enemy half-size)
      ) {
        this.explodeEnemy(enemy);
        enemy.dispose();
        this.enemies.splice(enemyIndex, 1);
        return true;
      }
    }
    return false;
  }

  private checkCollisionWithOtherEnemies(enemy: BABYLON.Mesh, enemyIndex: number): boolean {
    for (let j = 0; j < this.enemies.length; j++) {
      if (j !== enemyIndex) {
        const other = this.enemies[j];
        if (BABYLON.Vector3.Distance(enemy.position, other.position) < 1) { // 1 is sum of half-widths
          this.explodeEnemy(enemy);
          this.explodeEnemy(other);
          enemy.dispose();
          other.dispose();
          // Remove both from array
          this.enemies.splice(Math.max(enemyIndex, j), 1);
          this.enemies.splice(Math.min(enemyIndex, j), 1);
          return true;
        }
      }
    }
    return false;
  }

  // Simple explosion effect (can be improved)
  private explodeEnemy(enemy: BABYLON.Mesh): void {
    // Step 1: Turn into a yellow sphere for a brief moment
    const explosionSphere = BABYLON.MeshBuilder.CreateSphere("explosionSphere", { diameter: 1.2 }, this.scene);
    explosionSphere.position = enemy.position.clone();
    const sphereMat = new BABYLON.StandardMaterial("explosionMat", this.scene);
    sphereMat.emissiveColor = new BABYLON.Color3(1, 1, 0); // Bright yellow
    sphereMat.alpha = 0.8;
    explosionSphere.material = sphereMat;

    // Hide the enemy mesh immediately
    enemy.isVisible = false;

    // After a short delay, remove the sphere and break into fragments
    setTimeout(() => {
      explosionSphere.dispose();

      const fragmentCount = 8;
      for (let i = 0; i < fragmentCount; i++) {
        const fragment = BABYLON.MeshBuilder.CreateBox("fragment", { size: 0.3 }, this.scene);
        fragment.position = enemy.position.clone();
        fragment.material = new BABYLON.StandardMaterial("fragMat", this.scene);
        (fragment.material as BABYLON.StandardMaterial).emissiveColor = new BABYLON.Color3(1, 0.5, 0);

        // Give each fragment a random velocity
        const direction = new BABYLON.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize().scale(2 + Math.random() * 2);

        // Animate the fragment
        let frame = 0;
        const maxFrames = 30;
        const anim = () => {
          fragment.position.addInPlace(direction.scale(0.2));
          // Fade out
          (fragment.material as BABYLON.StandardMaterial).alpha = 1 - frame / maxFrames;
          frame++;
          if (frame < maxFrames) {
            requestAnimationFrame(anim);
          } else {
            fragment.dispose();
          }
        };
        anim();

        this.fragments.push(fragment);
      }

      // Dispose the original enemy mesh
      enemy.dispose();
    }, 150); // 150ms yellow sphere before breaking into pieces
  }

  private takeDamage(amount: number): void {
    // Shield absorbs damage first
    if (this.shield > 0) {
      const shieldDamage = Math.min(this.shield, amount);
      this.shield -= shieldDamage;
      amount -= shieldDamage;
      this.lastShieldRegenTime = performance.now(); // Reset shield regen timer
    }
    
    // Remaining damage goes to health
    if (amount > 0) {
      this.health = Math.max(0, this.health - amount);
      this.lastHealthRegenTime = performance.now(); // Reset health regen timer
    }
    
    // Update UI
    this.healthText.text = `Health: ${this.health}/${this.maxHealth}`;
    this.shieldText.text = `Shield: ${this.shield}/${this.maxShield}`;
    
    if (this.health <= 0) {
      this.isGameOver = true;
      this.gameOverText.text = `GAME OVER\nFinal Score: ${this.score}\nPress R to restart`;
      this.gameOverText.isVisible = true;
    }
  }

  private addScore(points: number): void {
    this.score += points;
    this.scoreText.text = `Score: ${this.score}`;
  }

  private updatePowerUps(): void {
    const currentTime = performance.now();
    
    this.powerUps.forEach((powerUp, powerUpIndex) => {
      // Bobbing animation
      powerUp.position.y += Math.sin(currentTime * 0.003 + powerUp._bobOffset) * 0.02;
      
      // Rotation animation
      powerUp.rotation.y += 0.02;
      
      // Check collision with player
      const distanceToPlayer = BABYLON.Vector3.Distance(powerUp.position, this.camera.position);
      if (distanceToPlayer < 3) { // Power-up collection radius
        this.collectPowerUp(powerUp);
        powerUp.dispose();
        this.powerUps.splice(powerUpIndex, 1);
        return;
      }
      
      // Remove power-up if too far from player (cleanup)
      if (distanceToPlayer > 150) {
        powerUp.dispose();
        this.powerUps.splice(powerUpIndex, 1);
      }
    });
  }

  private collectPowerUp(powerUp: PowerUpMesh): void {
    const currentTime = performance.now();
    
    switch (powerUp._type) {
      case 'health':
        this.health = Math.min(this.maxHealth, this.health + 30);
        this.healthText.text = `Health: ${this.health}/${this.maxHealth}`;
        this.addScore(25); // Bonus points for collecting power-up
        break;
        
      case 'shield':
        this.shield = Math.min(this.maxShield + this.maxShieldBoost, this.shield + 25);
        this.shieldText.text = `Shield: ${this.shield}/${this.maxShield + this.maxShieldBoost}`;
        this.addScore(25);
        break;
        
      case 'fireRate':
        this.fireRateBoostEndTime = currentTime + 10000; // 10 seconds boost
        this.addScore(50); // More points for temporary boost
        // Update fire rate immediately if currently firing
        if (this.fireIntervalId !== null) {
          clearInterval(this.fireIntervalId);
          this.fireIntervalId = setInterval(() => this.fireLaser(), this.getCurrentFireRate());
        }
        break;
        
      case 'shieldBoost':
        this.shieldBoostEndTime = currentTime + 15000; // 15 seconds boost
        this.maxShieldBoost = 50; // Extra 50 shield capacity
        this.shield = Math.min(this.maxShield + this.maxShieldBoost, this.shield + 50);
        this.shieldText.text = `Shield: ${this.shield}/${this.maxShield + this.maxShieldBoost}`;
        this.addScore(75); // High points for best power-up
        break;
    }
  }

  private updatePowerUpEffects(currentTime: number): void {
    // Check if fire rate boost expired
    if (this.fireRateBoostEndTime > 0 && currentTime > this.fireRateBoostEndTime) {
      this.fireRateBoostEndTime = 0;
      // Update fire rate if currently firing
      if (this.fireIntervalId !== null) {
        clearInterval(this.fireIntervalId);
        this.fireIntervalId = setInterval(() => this.fireLaser(), this.getCurrentFireRate());
      }
    }
    
    // Check if shield boost expired
    if (this.shieldBoostEndTime > 0 && currentTime > this.shieldBoostEndTime) {
      this.shieldBoostEndTime = 0;
      this.maxShieldBoost = 0;
      // Reduce shield if it's above normal max
      if (this.shield > this.maxShield) {
        this.shield = this.maxShield;
      }
      this.shieldText.text = `Shield: ${this.shield}/${this.maxShield + this.maxShieldBoost}`;
    }
  }

  private getCurrentFireRate(): number {
    return this.fireRateBoostEndTime > performance.now() ? 75 : this.fireRate; // 2x faster when boosted
  }

  private updateHealth(currentTime: number): void {
    // Shield regeneration - 2 shield per second after 2 seconds without taking damage
    if (this.shield < this.maxShield && currentTime - this.lastShieldRegenTime > 2000) {
      this.shield = Math.min(this.maxShield, this.shield + 2);
      this.shieldText.text = `Shield: ${this.shield}/${this.maxShield}`;
    }
    
    // Health regeneration - 1 health per second after 4 seconds without damage
    if (this.health < this.maxHealth && currentTime - this.lastHealthRegenTime > 4000) {
      this.health = Math.min(this.maxHealth, this.health + 1);
      this.healthText.text = `Health: ${this.health}/${this.maxHealth}`;
    }
  }

  private restartGame(): void {
    // Reset game state
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.score = 0;
    this.isGameOver = false;
    this.gameOverText.isVisible = false;
    this.healthText.text = `Health: ${this.health}/${this.maxHealth}`;
    this.shieldText.text = `Shield: ${this.shield}/${this.maxShield}`;
    this.scoreText.text = `Score: ${this.score}`;
    
    // Reset power-up effects
    this.fireRateBoostEndTime = 0;
    this.shieldBoostEndTime = 0;
    this.maxShieldBoost = 0;
    
    // Clear all enemies
    this.enemies.forEach(enemy => enemy.dispose());
    this.enemies.length = 0;
    
    // Clear all lasers
    this.lasers.forEach(laser => laser.dispose());
    this.lasers.length = 0;
    
    // Clear all enemy projectiles
    this.enemyProjectiles.forEach(projectile => projectile.dispose());
    this.enemyProjectiles.length = 0;
    
    // Clear all power-ups
    this.powerUps.forEach(powerUp => powerUp.dispose());
    this.powerUps.length = 0;
    
    // Clear all fragments
    this.fragments.forEach(fragment => fragment.dispose());
    this.fragments.length = 0;
    
    // Reset camera position
    this.camera.position = new BABYLON.Vector3(0, 0, -10000);
  }

  private setupEventListeners(): void {
    // Keyboard input
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      this.keys[e.key] = true;
      
      // Restart game when R is pressed and game is over
      if (e.key.toLowerCase() === 'r' && this.isGameOver) {
        this.restartGame();
      }
    });

    window.addEventListener("keyup", (e: KeyboardEvent) => {
      this.keys[e.key] = false;
    });

    // Mouse/touch input for auto-firing
    window.addEventListener("pointerdown", () => {
      if (this.fireIntervalId === null) {
        this.fireLaser();
        this.fireIntervalId = setInterval(() => this.fireLaser(), this.getCurrentFireRate());
      }
    });

    window.addEventListener("pointerup", () => {
      if (this.fireIntervalId !== null) {
        clearInterval(this.fireIntervalId);
        this.fireIntervalId = null;
      }
    });

    // Window resize
    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }

  private startGameLoop(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  public dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}

interface LaserMesh extends BABYLON.Mesh {
  _direction: BABYLON.Vector3;
  _alive: boolean;
}

interface EnemyMesh extends BABYLON.Mesh {
  _canShoot: boolean;
  _lastShotTime: number;
  _shootCooldown: number;
}

interface EnemyProjectile extends BABYLON.Mesh {
  _direction: BABYLON.Vector3;
  _speed: number;
  _alive: boolean;
}

interface PowerUpMesh extends BABYLON.Mesh {
  _type: 'health' | 'shield' | 'fireRate' | 'shieldBoost';
  _bobOffset: number;
}

interface KeyState {
  [key: string]: boolean;
}
