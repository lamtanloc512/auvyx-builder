<?php
/**
 * Auvyx Builder and Auvyx Builder Pro (docs/editions.md). The free plugin carries no locked feature (WordPress.org guideline 5):
 * Pro's templates, settings and front-end code live in the Pro plugin, which answers the `auvyx_builder_edition` filter with
 * its state and plugs into the free plugin's extension points.
 *
 * - The editors read `Edition::studio_config()`: without Pro, Pro's settings are hidden; with Pro and no active licence they
 *   show with a badge. The free editor names Pro once, under its section library.
 * - Auvyx Builder → Pro licence: a tab only while Pro is active, where Pro prints its licence card.
 * - Pro content on a site without Pro degrades quietly: a popup section stays hidden instead of showing in place.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Edition;

use Auvyx\Builder\Module;
use Auvyx\Builder\Plugin;
use Auvyx\Builder\Modules\Studio\Studio;

defined( 'ABSPATH' ) || exit;

final class Edition implements Module {

	public const TAB = '-pro';

	public function id(): string {
		return 'edition';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_filter( 'auvyx_builder_admin_tabs', array( $this, 'tab' ), 99 ); // last before Settings; only while Pro is active
		add_filter( 'render_block_auvyx/section', array( $this, 'without_pro' ), 10, 2 );
	}

	/** @return array{upgradeUrl: string, plans: string[], features: array<string, array{title: string, description: string}>, freeKits: string[], proTemplates: string[]} */
	public static function data(): array {
		return Plugin::shared_data( 'editions' );
	}

	/**
	 * The Pro plugin's answer: installed (`pro`), licence active (`licensed`), the licence's plan.
	 *
	 * @return array{pro: bool, licensed: bool, plan: string}
	 */
	public static function state(): array {
		/**
		 * Auvyx Builder Pro reports itself here.
		 *
		 * @param array{pro: bool, licensed: bool, plan: string} $state
		 */
		$state = apply_filters(
			'auvyx_builder_edition',
			array(
				'pro'      => false,
				'licensed' => false,
				'plan'     => '',
			)
		);
		$state = is_array( $state ) ? $state : array();
		$pro   = true === ( $state['pro'] ?? false );
		return array(
			'pro'      => $pro,
			'licensed' => $pro && true === ( $state['licensed'] ?? false ),
			'plan'     => $pro ? (string) ( $state['plan'] ?? '' ) : '',
		);
	}

	/** Auvyx Builder Pro is installed and active (its front-end features run, licence or not). */
	public static function pro(): bool {
		return self::state()['pro'];
	}

	/** Pro's licence is active: Pro features can be used in the editor and the admin. */
	public static function licensed(): bool {
		return self::state()['licensed'];
	}

	public static function upgrade_url(): string {
		/** Filters where "Get Auvyx Builder Pro" leads. */
		return (string) apply_filters( 'auvyx_builder_upgrade_url', self::data()['upgradeUrl'] );
	}

	/**
	 * What Auvyx Studio reads (host-wordpress ConfigDecoder.edition).
	 *
	 * @return array{pro: bool, licensed: bool, upgradeUrl: string, manageUrl: string}
	 */
	public static function studio_config(): array {
		$state = self::state();
		return array(
			'pro'        => $state['pro'],
			'licensed'   => $state['licensed'],
			'upgradeUrl' => self::upgrade_url(),
			'manageUrl'  => $state['pro'] && current_user_can( 'manage_options' ) ? admin_url( 'admin.php?page=' . Studio::MENU . self::TAB ) : '',
		);
	}

	/**
	 * Islands served by another plugin (Auvyx Builder Pro's): name → address, for the Studio's canvas.
	 *
	 * @return array<string, string>
	 */
	public static function island_urls(): array {
		$urls = array();
		/** Islands (front-end scripts named by FrontEnd.scripts) another plugin serves: name → URL. */
		foreach ( (array) apply_filters( 'auvyx_builder_island_urls', array() ) as $name => $url ) {
			if ( is_string( $name ) && preg_match( '/^[a-z0-9-]{1,40}$/', $name ) && is_string( $url ) && '' !== $url ) {
				$urls[ $name ] = esc_url_raw( $url );
			}
		}
		return $urls;
	}

	/**
	 * A popup section on a site without Auvyx Builder Pro: hidden, so it never shows in place.
	 *
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function without_pro( $html, $block ): string {
		$html = (string) $html;
		if ( ! self::pro() && in_array( 'auvyx-popup', preg_split( '/\s+/', (string) ( $block['attrs']['className'] ?? '' ) ), true ) && ! is_admin() && ! ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return '';
		}
		return $html;
	}

	// ---- admin -----------------------------------------------------------------------------

	/**
	 * Auvyx Builder Pro's licence tab, while Pro is active (nothing is added without it).
	 *
	 * @param array<string, mixed> $tabs Add-on tabs.
	 * @return array<string, mixed>
	 */
	public function tab( $tabs ): array {
		$tabs = is_array( $tabs ) ? $tabs : array();
		if ( self::pro() ) {
			$tabs[ self::TAB ] = array(
				__( 'Pro licence', 'auvyx-builder' ),
				'manage_options',
				array( $this, 'page' ),
				__( 'Your Auvyx Builder Pro licence: updates, support and every Pro feature.', 'auvyx-builder' ),
			);
		}
		return $tabs;
	}

	public function page(): void {
		/** Auvyx Builder Pro prints its licence card here. */
		do_action( 'auvyx_builder_pro_page' );
	}
}
