ig.module(
    'game.feature.party.entities.party-member-entity'
).requires('game.feature.player.entities.player-base','game.feature.player.entities.player').defines(function() {
    "use strict";

    var START_ADJUST_DIST = 48,
        START_RUN_DIST = 80,
        OUT_OF_SCREEN_RESPAWN_TIME = 1.5,
        MAX_TARGET_DISTANCE = 160,
        GO_TO_TARGET_DISTANCE = 120,
        MIN_TARGET_DISTANCE = 48,
        TARGET_CLOSE_DISTANCE = 16,
        TARGET_CIRCLE_DISTANCE = 80,
        TARGET_THROW_DISTANCE = 100;


    var MEMBER_NAV_TARGET = {
        PLAYER: 1,
        PLAYER_DISTANCE: 2,
        TARGET_ADJUST: 3,
        TARGET_CLOSE: 4,
        TARGET_CIRCLE: 5,
        TARGET_DISTANCE: 6,
        TARGET_CLOSE_BEHIND: 7,
        TARGET_CLOSE_FRONT: 8,
        TARGET_DISTANCE_BEHIND: 9,
        TARGET_DISTANCE_FRONT: 10,
        STAY_AWAY: 11
    }

    var THROW_PROBABILITY = 0.3;

    var STATE = {
        IDLE: {
            start: function(entity) {
                entity.setDefaultConfig(entity.configs.normal);
            },
            update: function(entity, target, targetStats) {
                //return STATE.PERMA_PUNCH;
                Vec2.assignC(entity.coll.accelDir, 0, 0);

                if (sc.model.isCombatActive() && sc.party.strategy.doNothing) {
                    targetStats.outOfScreenTime = 0;
                    if (targetStats.distance < 120 || targetStats.distance > 320) {
                        return STATE.STAY_AWAY;
                    } else {
                        return STATE.ROTATE;
                    }
                } else {
                    if (targetStats.distance > START_ADJUST_DIST) {
                        return STATE.FOLLOW;
                    }
                    if (targetStats.distance < 4) {
                        return STATE.BACKOFF;
                    }
                    if (Vec2.angle(targetStats.distVec, entity.face) > Math.PI * 0.5) {
                        return STATE.ROTATE;
                    }
                }

            }
        },
        STAY_AWAY: {
            start: function(entity, target) {
                entity.setDefaultConfig(entity.configs.normal);
                entity.setNavTarget(MEMBER_NAV_TARGET.STAY_AWAY);
                entity.timer.move = 4;
            },
            update: function(entity, target, targetStats) {
                entity.coll.relativeVel = 1;
                targetStats.outOfScreenTime = 0;
                if (entity.nav.path.moveEntity())
                    return STATE.IDLE;
                if (entity.timer.move <= 0)
                    return STATE.IDLE;
                if (entity.jumping) return;
                if (targetStats.outOfScreenTime > OUT_OF_SCREEN_RESPAWN_TIME) {
                    entity.resetPos();
                }
            }

        },
        BACKOFF: {
            start: function(entity, target) {
                entity.setDefaultConfig(entity.configs.normal);

                entity.coll.relativeVel = 0.5;
                entity.setNavTarget(MEMBER_NAV_TARGET.PLAYER_DISTANCE);

            },
            update: function(entity, target, targetStats) {
                entity.faceDirFixed = true;
                Vec2.assign(entity.face, targetStats.distVec);

                if (targetStats.distance >= 16) {
                    Vec2.assignC(entity.coll.accelDir, 0, 0);
                    return STATE.IDLE;
                }
                if (entity.nav.path.moveEntity())
                    return STATE.IDLE;
            }
        },
        ROTATE: {
            start: function(entity) {
                entity.setDefaultConfig(entity.configs.normal);
            },
            update: function(entity, target, targetStats) {
                Vec2.rotateToward(entity.face, targetStats.distVec, Math.PI * 2 * ig.system.tick * 2);
                Vec2.assignC(entity.coll.accelDir, 0, 0);
                if (!sc.model.isCombatActive() || !sc.party.strategy.doNothing) {
                    if (targetStats.distance > START_ADJUST_DIST) {
                        return STATE.FOLLOW;
                    }
                }
                if (Vec2.angle(targetStats.distVec, entity.face) < Math.PI * 0.1) {
                    return STATE.IDLE;
                }
            }
        },
        FOLLOW: {
            start: function(entity, target) {
                entity.setDefaultConfig(entity.configs.normal);
                entity.setNavTarget(MEMBER_NAV_TARGET.PLAYER);
            },
            update: function(entity, target, targetStats) {
                if (sc.model.isCombatActive() && sc.party.strategy.doNothing) {
                    return STATE.STAY_AWAY;
                }
                entity.coll.relativeVel = targetStats.distance > START_RUN_DIST ? 1 : targetStats.distance / START_RUN_DIST;
                if (entity.jumping)
                    entity.coll.relativeVel = 1;
                if (entity.nav.path.moveEntity())
                    return STATE.IDLE;
                if (entity.jumping) return;
                if (targetStats.outOfScreenTime > OUT_OF_SCREEN_RESPAWN_TIME) {
                    entity.resetPos();
                }
            }
        },
        COMBAT_IDLE: {
            start: function(entity) {
                entity.reselectTarget();
                entity.setDefaultConfig(entity.configs.aiming);
                entity.faceToTarget.active = true;
            },
            update: function(entity, target, targetStats) {
                Vec2.assignC(entity.coll.accelDir, 0, 0);
                if (!entity.target) return;
                if (!sc.party.strategy.noAttack && entity.timer.attack <= 0) {
                    if (sc.EnemyAnno.shouldBePassive(entity.target, entity)) {
                        entity.timer.attack = 0.2;
                        return STATE.COMBAT_SIDEWAYS;
                    } else {
                        var throwProbability = THROW_PROBABILITY;
                        if (Math.random() <= sc.EnemyAnno.getUnderstandFactor(entity.target, entity)) {
                            if (sc.EnemyAnno.useMelee(entity.target))
                                throwProbability = 0;
                            else if (sc.EnemyAnno.useRanged(entity.target))
                                throwProbability = 1;
                        }

                        return Math.random() < throwProbability ? STATE.COMBAT_THROWING : STATE.MELEE;
                    }

                }
                if (targetStats.distance < MIN_TARGET_DISTANCE || targetStats.distance > MAX_TARGET_DISTANCE) {
                    return STATE.COMBAT_ADJUST;
                }
                if (entity.timer.move <= 0 && entity.timer.attack > 0.5) {
                    entity.timer.move = 0.5 + Math.random() * 0.5;
                    return STATE.COMBAT_SIDEWAYS
                }
            }
        },
        COMBAT_SIDEWAYS: {
            start: function(entity, target, targetStats, data) {
                entity.setDefaultConfig(entity.configs.aiming);
                entity.faceToTarget.active = true;
                if (sc.EnemyAnno.hasLookAway(target, entity)) {
                    entity.faceToTarget.offset = 0.5;
                }
                entity.coll.relativeVel = 1;
                entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_CIRCLE);
                data.attackCount = 0;
            },
            update: function(entity, target, targetStats, data) {
                if (entity.nav.path.moveEntity()) {
                    return STATE.COMBAT_IDLE;
                }
            }
        },
        COMBAT_THROWING: {
            start: function(entity, target, targetStats, data) {
                entity.setDefaultConfig(entity.configs.normal);
                entity.faceToTarget.active = false;
                entity.coll.relativeVel = 1;
                if (sc.EnemyAnno.hasAttackBack(entity.target, this)) {
                    entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_DISTANCE_BEHIND);
                } else if (sc.EnemyAnno.hasAttackFront(entity.target, this)) {
                    entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_DISTANCE_FRONT);
                } else {
                    entity.faceToTarget.active = true;
                    entity.setDefaultConfig(entity.configs.aiming);
                    entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_DISTANCE);
                }

                data.attackCount = 0;
            },
            update: function(entity, target, targetStats, data) {
                if (data.attackCount == 0) {
                    if (entity.nav.path.moveEntity()) {
                        entity.faceToTarget.active = true;
                        entity.setDefaultConfig(entity.configs.aiming);
                        this.startThrow(entity, targetStats, data);
                    }
                } else if (data.attackCount < 4 && entity.timer.action <= 0) {
                    this.startThrow(entity, targetStats, data);
                } else if (data.attackCount == 4 && entity.timer.action <= 0) {
                    entity.resetAttackTimer();
                    return STATE.COMBAT_IDLE;
                }
            },
            startThrow: function(entity, targetStats, data) {
                entity.cancelAction();
                data.attackCount++;
                var type;
                if (data.attackCount == 1)
                    type = "THROW_CHARGED";
                else
                    type = (data.attackCount % 2 == 1 ? "THROW_NORMAL" : "THROW_NORMAL_REV");
                Vec2.assign(entity.face, targetStats.distVec);
                Vec2.assign(entity.throwDirData, targetStats.distVec);
                entity.setAttribute("dashDir", entity.face);
                entity.doPlayerAction(type);
            }
        },
        COMBAT_ADJUST: {
            start: function(entity) {
                entity.nav.path.interrupt();
                entity.setDefaultConfig(entity.configs.normal);
                entity.faceToTarget.active = false;
                entity.coll.relativeVel = 1;
                entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_ADJUST);
            },
            update: function(entity, target, targetStats) {
                if (entity.nav.path.moveEntity()) {
                    if (targetStats.distance < MIN_TARGET_DISTANCE || targetStats.distance > MAX_TARGET_DISTANCE)
                        entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_ADJUST);
                    else
                        return STATE.COMBAT_IDLE;
                }
            }
        },
        PERMA_PUNCH: {
            start: function(entity, target, targetStats, data) {
                data.attackCount = 0;
            },
            update: function(entity, target, targetStats, data) {
                if (entity.timer.action <= 0) {
                    this.startAttack(entity, targetStats, data);
                }
            },
            startAttack: function(entity, targetStats, data) {
                entity.cancelAction();
                data.attackCount++;
                var type = (data.attackCount % 2 == 1 ? "ATTACK" : "ATTACK_REV");
                entity.coll.setType(ig.COLLTYPE['VIRTUAL']);
                Vec2.assign(entity.face, targetStats.distVec);
                entity.setAttribute("dashDir", Vec2.create());
                entity.doPlayerAction(type);
            }
        },
        MELEE: {
            start: function(entity, target, targetStats, data) {
                entity.nav.path.interrupt();
                entity.setDefaultConfig(entity.configs.normal);
                entity.coll.relativeVel = 1;
                data.directionMove = false;
                if (sc.EnemyAnno.hasAttackBack(entity.target, this)) {
                    data.directionMove = true;
                    entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_CLOSE_BEHIND);
                } else if (sc.EnemyAnno.hasAttackFront(entity.target, this)) {
                    data.directionMove = true;
                    entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_CLOSE_FRONT);
                } else
                    entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_CLOSE);
                data.attackCount = 0;
            },
            update: function(entity, target, targetStats, data) {
                if (data.directionMove) {
                    var done = entity.nav.path.moveEntity();
                    if (done) {
                        entity.setNavTarget(MEMBER_NAV_TARGET.TARGET_CLOSE);
                        data.directionMove = false;
                    }
                } else if (data.attackCount == 0) {
                    var done = entity.nav.path.moveEntity();
                    if (done || targetStats.distance < 16) {
                        this.startAttack(entity, targetStats, data);
                    } else if (targetStats.distance < 32) {
                        entity.coll.setType(ig.COLLTYPE['VIRTUAL']);
                    }
                } else if (data.attackCount < entity.model.comboCount && entity.timer.action <= 0) {
                    if (targetStats.distance > 48) {
                        entity.resetAttackTimer();
                        return STATE.COMBAT_IDLE;
                    }
                    this.startAttack(entity, targetStats, data);
                } else if (data.attackCount == entity.model.comboCount && entity.timer.action <= 0) {
                    entity.resetAttackTimer();
                    return STATE.COMBAT_IDLE;
                }
            },
            startAttack: function(entity, targetStats, data) {
                entity.cancelAction();
                data.attackCount++;
                var type;
                if (data.attackCount == entity.model.comboCount) {
                    type = "ATTACK_FINISHER";
                } else
                    type = (data.attackCount % 2 == 1 ? "ATTACK" : "ATTACK_REV");
                entity.coll.setType(ig.COLLTYPE['VIRTUAL']);
                Vec2.assign(entity.face, targetStats.distVec);
                entity.setAttribute("dashDir", entity.face);
                entity.doPlayerAction(type);
            }
        },
        DODGE: {
            start: function(entity) {
                entity.nav.path.interrupt();
                entity.setDefaultConfig(entity.configs.normal);
                ig.navigation.getDodgePosition(c_tmpPos, entity, entity.threat, 48);
                var dir = entity.getAlignedPos(ig.ENTITY_ALIGN['BOTTOM']);
                Vec3.sub(dir, c_tmpPos);
                Vec3.flip(dir);
                entity.faceToTarget.active = true;
                entity.setAttribute("dashDir", dir);
                entity.doPlayerAction("DASH");
            },
            update: function(entity, target, targetStats) {
                if (!entity.currentAction) {
                    return entity.inCombat ? STATE.COMBAT_IDLE : STATE.IDLE;
                }
            }
        }
    }

    var c_input = {
            thrown: false,
            aim: false,
            autoThrow: false,
            attack: false,
            guard: false,
            charge: false,
            dashX: 0,
            dashY: 0,
            switchMode: false,
            moveDir: Vec2.create()
        }
    var DODGE_DELAY = 0.4;

    var c_tmpDir = Vec2.create(),
        c_tmpPos = Vec3.create();
        sc.PartyMemberEntity=ig.ENTITY['Player'].extend({
            posOffset: Vec2.create(),
            show:function(){
                this.parent();
                var c=sc.PlayerCrossHairController.extend({
                    isAiming:()=>sc.remote.aiming,

                    updatePos:function(crossHair){
                        crossHair.coll.pos.x=sc.remote.mouse.x+ ig.game.screen.x;
                        crossHair.coll.pos.y=sc.remote.mouse.y+ ig.game.screen.y;

                    }
                });
                this.gui.crosshair.controller=new c();
            },
            gatherInput: function() {
                var input = c_input;
                input.thrown = false;
                input.aimStart = false;
                input.aim = false;
                input.attack = false;
                input.autoThrow = false;
                input.charge = false;
                input.dashX = 0;
                input.dashY = 0;
                input.guard = false;
                c_input.switchMode = false;
                Vec2.assign(input.moveDir, 0, 0);
                if (ig.game.isControlBlocked())
                    return input;


                //input.charge = sc.control.charge();
                var c_vec2 = Vec2.create();
                var dist=(function(player) {
                    if (!player) return 9999;
                    var coll = player.coll;
                    ig.system.getScreenFromMapPos(c_vec2, coll.pos.x + coll.size.x / 2,
                        coll.pos.y + coll.size.y / 2 - coll.pos.z - Constants.BALL_HEIGHT - Constants.BALL_SIZE / 2);
                    return Vec2.distance(c_vec2, sc.remote.mouse) / ig.system.zoom;
                })(this)
                if (!ig.interact.isBlocked()) {
                    if (this.model.getCore(sc.PLAYER_CORE['THROWING'])) {
                        input.aimStart = sc.remote.aimStart;
                        input.aim = sc.remote.aiming;
                        input.thrown = sc.remote.thrown&&(sc.remote.thrown=false,true);
                        input.autoThrow = sc.control.autoThrown();
                    }
                    if (!this.floating && this.model.getCore(sc.PLAYER_CORE['CLOSE_COMBAT'])) {
                        if (this.model.getCore(sc.PLAYER_CORE['THROWING']))
                            input.attack = sc.remote.aimStart&&(dist<sc.ATTACK_INPUT_DISTANCE);
                        else
                            input.attack = sc.control.fullScreenAttacking();
                    }
                }
                sc.remote.aimStart=false;
                input.switchMode = sc.control.elementModeSwitch();

                if (this.model.getCore(sc.PLAYER_CORE['GUARD']))
                    input.guard = sc.remote.dash;

                if (!this.floating && this.model.getCore(sc.PLAYER_CORE['MOVE'])) {
                    this.coll.relativeVel = 1;
                    input.moveDir=sc.remote.move;
                }
                if (!Vec2.isZero(input.moveDir)) {
                    var angle = Vec2.angle(input.moveDir, this.lastMoveDir);
                    if (!Vec2.isZero(this.lastMoveDir) && Math.abs(angle) > Math.PI / 3)
                        this.moveDirStartedTimer = 0;
                    this.moveDirStartedTimer += ig.system.actualTick;
                } else {
                    this.moveDirStartedTimer = 0;
                }

                var ignoreGuardOverride = false;
                if (this.charging.time >= 0 || sc.inputForcer.isSubmitted())
                    ignoreGuardOverride = true;
                if (input.aim)
                    ignoreGuardOverride = true;
                if (ig.input.currentDevice == ig.INPUT_DEVICES.KEYBOARD_AND_MOUSE)
                    ignoreGuardOverride = true;

                // Keep previous movement for a short time to make stopping at diagonal movement work nicely with keyboard
                if (this.keepLastMoveDir <= 0 && !Vec2.equal(this.lastMoveDir, input.moveDir))
                    this.keepLastMoveDir = 2 / 60;

                if (this.keepLastMoveDir > 0) {
                    this.keepLastMoveDir -= ig.system.actualTick;

                    if (!sc.inputForcer.isSubmitted()) {
                        if (this.keepLastMoveDir > 0 && (input.moveDir.x != 0 || input.moveDir.y != 0)) {
                            if (input.moveDir.x == 0) input.moveDir.x = this.lastMoveDir.x;
                            if (input.moveDir.y == 0) input.moveDir.y = this.lastMoveDir.y;
                        }
                    }
                }

                Vec2.assign(this.lastMoveDir, input.moveDir);

                if (!this.jumping) {

                    if (sc.remote.dash && this.dashBlock < 0.2 &&
                        (ignoreGuardOverride || this.moveDirStartedTimer > 3 / 60)) {
                        input.dashX = input.moveDir.x;
                        input.dashY = input.moveDir.y;
                    }
                }

                return input;
            }

        })
/*
    sc.PartyMemberEntity = sc.PlayerBaseEntity.extend({

        party: sc.COMBATANT_PARTY['PLAYER'],
        material: sc.COMBATANT_MATERIAL['ORGANIC'],

        configs: {
            normal: null,
            aiming: null
        },

        guard: {
            damage: 0,
            timer: 0,
            fxSheet: new ig.EffectSheet("guard"),
            fxHandle: null,
            currentKey: null
        },

        model: null,
        posOffset: Vec2.create(),
        navTarget: null,

        state: null,
        inCombat: false,
        targetStats: {
            distVec: Vec2.create(),
            distance: 0,
            outOfScreenTime: 0
        },
        stateData: {},
        timer: {
            action: 0,
            move: 0,
            attack: 0
        },
        dodgeBlocked: 0,
        throwDirData: Vec2.create(),


        init: function(x, y, z, settings) {
            this.parent(x, y, z, settings);
            this.configs.normal.overwrite('collType', ig.COLLTYPE['SEMI_IGNORE']);
            this.configs.aiming.overwrite('collType', ig.COLLTYPE['SEMI_IGNORE']);
            this.setDefaultConfig(this.configs.normal);
            this.model = sc.party.getPartyMemberModel(settings['partyMemberName']);
            this.animSheet = this.model.animSheet;
            this.proxies = this.model.getBalls();
            this.initAnimations();
            this.params = this.model.params;
            this.params.setCombatant(this);
            if (settings['posOffset'])
                Vec2.assign(this.posOffset, settings['posOffset']);
            this.state = STATE.IDLE;
        },

        show: function(noEffects) {
            this.parent(noEffects);
            if (!noEffects) {
                this.animState.alpha = 0;
                ig.game.effects.teleport.spawnOnTarget("showDefault", this, {
                    'align': "CENTER"
                });
                this.setAction(APPEAR_ACTION);
            }
        },

        kill: function(onMapChange) {
            if (this.model && this.params.isDefeated()) {
                sc.party.onMemberDefeat(this.model.name);
            }
            this.parent(onMapChange);
        },


        leaveParty: function(immediately) {
            if (this._killed) return;
            this.model = null;
            this.endCombat();
            if (immediately) {
                this.kill();
            } else {
                this.setAction(DISAPPEAR_ACTION);
            }
        },

        resetAttackTimer: function() {
            if (this.target && sc.EnemyAnno.isWeak(this.target))
                this.timer.attack = 1;
            else
                this.timer.attack = 1 + Math.random() * 2;
        },


        startCombat: function() {
            this.selectTarget();
            if (this.target) {
                this.inCombat = true;
                this.timer.attack = 1 + Math.random() * 1;
                this.changeState(STATE.COMBAT_IDLE);
            }

        },
        endCombat: function() {
            this.setTarget(null);
            this.inCombat = false;
            this.changeState(STATE.IDLE);
        },

        doPlayerAction: function(typeString) {
            var type = sc.PLAYER_ACTION[typeString];
            if (!type) throw new Error("Unknown Action Type: " + typeString);
            var action = this.model.getAction(type);
            this.setAction(action);
        },

        setActionBlocked: function(blockData) {
            this.timer.action = blockData["action"];
        },

        hasValidTarget: function() {
            return this.target && !this.target._killed && !this.target.isDefeated() && this.target.target;
        },

        selectTarget: function() {
            if (!this.hasValidTarget()) {
                var target = sc.combat.getPlayerTarget(this);
                this.setTarget(target);
            }
        },
        reselectTarget: function() {
            var target = sc.combat.getPlayerTarget(this);
            this.setTarget(target);
        },
        changeState: function(state) {
            this.state = state;
            this.cancelAction();
            var ent = this.target || ig.game.playerEntity;
            this.state.start && this.state.start(this, ent, this.targetStats, this.stateData);
        },

        isControlBlocked: function() {

            return !this.model || this.hasStun() || this.params.isDefeated() || (this.currentAction && this.currentAction.eventAction) || this.currentAction == APPEAR_ACTION;
        },

        getDodgeProbability: function() {
            return 0.5 * sc.party.strategy.dodgeFactor;
        },

        goToCombat: function() {
            return sc.model.isCombatActive() && !sc.party.strategy.doNothing;
        },

        update: function() {
            if (this.dodgeBlocked) {
                this.dodgeBlocked -= ig.system.tick;
                if (this.dodgeBlocked <= 0) {
                    this.dodgeBlocked = 0;
                }
            }

            if (sc.model.isCutscene() && this.currentAction && this.currentAction.eventAction) {
                this.eventBlocked = true;
            }

            if (!this.eventBlocked || !sc.model.isCutscene()) {
                if (this.eventBlocked) {
                    this.navTarget = null;
                    this.changeState(STATE.IDLE);
                    this.eventBlocked = false;
                }
                if (ig.EntityTools.isInScreen(this, 0))
                    this.targetStats.outOfScreenTime = 0;
                else
                    this.targetStats.outOfScreenTime += ig.system.tick;
                if (this.timer.attack > 0) this.timer.attack -= ig.system.tick;
                if (this.timer.move > 0) this.timer.move -= ig.system.tick;
                if (this.timer.action > 0) this.timer.action -= ig.system.tick;

                var player = ig.game.playerEntity;
                if (!this.isControlBlocked()) {

                    if (!this.state)
                        this.changeState(this.inCombat ? STATE.COMBAT_IDLE : STATE.IDLE);

                    if (sc.model.isCombatActive() && !this.jumping && this.state != STATE.DODGE) {
                        var threat = sc.combat.getNearbyThreat(this, 48, 1);
                        if (threat && !this.dodgeBlocked) {
                            this.dodgeBlocked = DODGE_DELAY;
                            if (Math.random() < this.getDodgeProbability()) {
                                this.threat = threat;
                                this.changeState(STATE.DODGE);
                            }

                        }
                    }

                    if (this.timer.action <= 0 && !this.jumping) {


                        if (this.goToCombat()) {
                            if (!this.inCombat) {
                                this.startCombat();
                            } else if (!this.hasValidTarget()) {
                                this.selectTarget();
                                if (this.target)
                                    this.changeState(STATE.COMBAT_IDLE);
                                else
                                    this.endCombat();
                            }
                        } else {
                            if (this.inCombat) {
                                this.endCombat();
                            }
                        }
                    }

                    var ent = this.target || player;

                    ig.CollTools.getDistVec2(this.coll, ent.coll, this.targetStats.distVec);
                    this.targetStats.distance = Vec2.length(this.targetStats.distVec);
                    this.targetStats.distance -= ent.coll.size.x / 2;

                    var newState = this.state.update(this, ent, this.targetStats, this.stateData);
                    if (newState) {
                        this.changeState(newState);
                    }
                } else {
                    this.state = null;
                }
            }
            this.parent();

            if (!this.model) {
                if (!this.currentAction) this.kill();
            }

        },

        resetPos: function() {
            sc.party.resetMemberPos(this.model.name);
            ig.game.effects.teleport.spawnOnTarget('showFast', this);
            this.nav.path.mapVersion = -1;
        },

        setNavTarget: function(target) {
            if (target == MEMBER_NAV_TARGET.PLAYER) {
                if (this.navTarget != target) {
                    this.nav.path.toEntity(ig.game.playerEntity, 16, {
                        'posOffset': this.posOffset
                    });
                }
            } else if (target == MEMBER_NAV_TARGET.PLAYER_DISTANCE) {
                this.nav.path.dodge(ig.game.playerEntity, 32);
            } else if (target == MEMBER_NAV_TARGET.TARGET_ADJUST) {
                this.nav.path.runAway(this.target, GO_TO_TARGET_DISTANCE, true);
            } else if (target == MEMBER_NAV_TARGET.TARGET_CLOSE) {
                this.nav.path.toEntity(this.target, TARGET_CLOSE_DISTANCE);
            } else if (target == MEMBER_NAV_TARGET.TARGET_CLOSE_BEHIND) {
                this.nav.path.runToFace(this.target, 0.5, 24, 80);
            } else if (target == MEMBER_NAV_TARGET.TARGET_CLOSE_FRONT) {
                this.nav.path.runToFace(this.target, 0, 24, 80);
            } else if (target == MEMBER_NAV_TARGET.TARGET_CIRCLE) {
                this.nav.path.sideways(this.target, TARGET_CIRCLE_DISTANCE, 16, true);
            } else if (target == MEMBER_NAV_TARGET.TARGET_DISTANCE) {
                this.nav.path.runAway(this.target, TARGET_THROW_DISTANCE, true);
            } else if (target == MEMBER_NAV_TARGET.TARGET_DISTANCE_BEHIND) {
                this.nav.path.runToFace(this.target, 0.5, TARGET_THROW_DISTANCE, TARGET_THROW_DISTANCE + 32, true);
            } else if (target == MEMBER_NAV_TARGET.TARGET_DISTANCE_FRONT) {
                this.nav.path.runToFace(this.target, 0, TARGET_THROW_DISTANCE, TARGET_THROW_DISTANCE + 32, true);
            } else if (target == MEMBER_NAV_TARGET.STAY_AWAY) {
                this.nav.path.runAway(ig.game.playerEntity, 240);
            }
            this.navTarget = target;
        },

        onNavigationFailed: function(timer) {
            if (timer > 5) {
                this.resetPos();
            }
        }

    });
*/


    var APPEAR_ACTION = new ig.Action("enemyStart", [{
        "type": "WAIT",
        "time": 0.4
    }]);

    var DISAPPEAR_ACTION = new ig.Action("enemyStart", [{
        "type": "SHOW_EFFECT",
        "effect": {
            "sheet": "teleport",
            "name": "hideDefault"
        },
        "wait": true,
        "align": "CENTER",
        "actionDetached": true
    }]);

});

// game/feature/party/plug-in.js