<?php
/**
 * Coming soon and maintenance mode, in Auvyx Builder → Settings (code on every page is Auvyx Builder Pro's SiteCode).
 *
 * - Visitors see one page (any published page, built in Auvyx Studio, or a simple
 *   screen with the site's name and a message); people who can edit pages see the site as usual, with a reminder in the
 *   admin bar. Coming soon answers 200 and asks search engines not to index; maintenance answers 503 with Retry-After,
 *   which tells search engines to come back rather than drop the pages.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\SiteTools;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\Studio\Studio;

defined( 'ABSPATH' ) || exit;

final class SiteTools implements Module {

	public const OPTION = 'auvyx_site_tools';
	public const MODES  = array( 'off', 'coming_soon', 'maintenance' );

	public function id(): string {
		return 'site-tools';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'admin_init', array( $this, 'register_setting' ) );
		add_action( 'auvyx_builder_settings_fields', array( $this, 'fields' ) );
		add_action( 'template_redirect', array( $this, 'gate' ), 1 );
		add_action( 'admin_bar_menu', array( $this, 'admin_bar' ), 100 );
	}

	/** @return array{mode: string, page: int, message: string} */
	public static function settings(): array {
		$saved = get_option( self::OPTION, array() );
		$saved = is_array( $saved ) ? $saved : array();
		return array(
			'mode'    => in_array( $saved['mode'] ?? 'off', self::MODES, true ) ? (string) ( $saved['mode'] ?? 'off' ) : 'off',
			'page'    => (int) ( $saved['page'] ?? 0 ),
			'message' => (string) ( $saved['message'] ?? '' ),
		);
	}

	/**
	 * What is kept: the mode, a published page, a plain message.
	 *
	 * @param mixed $value Submitted.
	 * @return array<string, mixed>
	 */
	public static function sanitize( $value ): array {
		$value = is_array( $value ) ? $value : array();
		$page  = absint( $value['page'] ?? 0 );
		return array(
			'mode'    => in_array( $value['mode'] ?? 'off', self::MODES, true ) ? (string) ( $value['mode'] ?? 'off' ) : 'off',
			'page'    => $page && 'page' === get_post_type( $page ) && 'publish' === get_post_status( $page ) ? $page : 0,
			'message' => mb_substr( sanitize_textarea_field( (string) ( $value['message'] ?? '' ) ), 0, 500 ),
		);
	}

	public function register_setting(): void {
		register_setting(
			Studio::MENU,
			self::OPTION,
			array(
				'type'              => 'object',
				'sanitize_callback' => array( self::class, 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	// ---- coming soon / maintenance --------------------------------------------------------------

	/** Whether this visitor gets the site as usual while the mode is on. */
	public static function bypass(): bool {
		/**
		 * Whether the current request sees the site while coming soon or maintenance mode is on.
		 *
		 * @param bool $bypass By default, people who can edit pages.
		 */
		return (bool) apply_filters( 'auvyx_site_mode_bypass', current_user_can( 'edit_pages' ) ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- the documented name (auvyx_ prefix).
	}

	/** The page visitors see while the mode is on (no theme header or footer: the page is the whole screen). */
	public static function screen( array $settings ): string {
		$page    = $settings['page'] ? get_post( $settings['page'] ) : null;
		$content = '';
		if ( $page instanceof \WP_Post && 'publish' === $page->post_status ) {
			// Rendered before the head, so the blocks' styles and scripts are enqueued in time.
			$content = do_blocks( $page->post_content );
		} else {
			$message = '' !== $settings['message'] ? $settings['message'] : ( 'maintenance' === $settings['mode']
				? __( 'We are making a few improvements. Please check back soon.', 'auvyx-builder' )
				: __( 'Something new is on its way. Check back soon.', 'auvyx-builder' ) );
			$content = sprintf(
				'<main class="auvyx-site-mode"><div class="auvyx-site-mode__card"><h1>%1$s</h1><p>%2$s</p></div></main>',
				esc_html( (string) get_bloginfo( 'name' ) ),
				nl2br( esc_html( $message ) )
			);
		}
		ob_start();
		?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
		<?php if ( 'coming_soon' === $settings['mode'] ) : ?>
<meta name="robots" content="noindex, nofollow">
		<?php endif; ?>
<style>.auvyx-site-mode{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:var(--wp--preset--color--auvyx-surface,#f5f5f5);color:var(--wp--preset--color--auvyx-text,#111)}.auvyx-site-mode__card{max-width:560px;text-align:center}.auvyx-site-mode h1{margin:0 0 12px;font-size:var(--wp--preset--font-size--auvyx-xl,2.25rem);line-height:1.1}.auvyx-site-mode p{margin:0;color:var(--wp--preset--color--auvyx-muted,#555);font-size:1.125rem;line-height:1.6}</style>
		<?php wp_head(); ?>
</head>
<body <?php body_class( 'auvyx-site-mode-on' ); ?>>
		<?php
		echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- rendered blocks of a published page, or escaped above.
		wp_footer();
		?>
</body>
</html>
		<?php
		return (string) ob_get_clean();
	}

	public function gate(): void {
		$settings = self::settings();
		if ( 'off' === $settings['mode'] || self::bypass() || is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return;
		}
		// The page shown is reachable at its own address too: there it is shown as the mode's screen.
		if ( 'maintenance' === $settings['mode'] ) {
			status_header( 503 );
			header( 'Retry-After: 3600' );
		} else {
			status_header( 200 );
		}
		nocache_headers();
		echo self::screen( $settings ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- see screen().
		exit;
	}

	/** @param \WP_Admin_Bar $bar Admin bar. */
	public function admin_bar( $bar ): void {
		$mode = self::settings()['mode'];
		if ( 'off' === $mode || ! current_user_can( 'edit_pages' ) ) {
			return;
		}
		$bar->add_node(
			array(
				'id'    => 'auvyx-site-mode',
				'title' => 'maintenance' === $mode ? __( 'Maintenance mode is on', 'auvyx-builder' ) : __( 'Coming soon mode is on', 'auvyx-builder' ),
				'href'  => current_user_can( 'manage_options' ) ? admin_url( 'admin.php?page=' . Studio::MENU . '-settings#auvyx-site-mode' ) : '',
				'meta'  => array( 'class' => 'auvyx-site-mode-flag' ),
			)
		);
	}

	// ---- settings card ---------------------------------------------------------------------

	public function fields(): void {
		$s     = self::settings();
		$name  = self::OPTION;
		$modes = array(
			'off'         => __( 'Off: the site is public', 'auvyx-builder' ),
			'coming_soon' => __( 'Coming soon: visitors see one page; search engines are asked not to index', 'auvyx-builder' ),
			'maintenance' => __( 'Maintenance: visitors see one page; search engines are told to come back (503)', 'auvyx-builder' ),
		);
		echo '<section class="auvyx-card" id="auvyx-site-mode"><h2>' . esc_html__( 'Coming soon & maintenance', 'auvyx-builder' ) . '</h2><p class="auvyx-muted">' . esc_html__( 'While it is on, people who can edit pages still see the whole site.', 'auvyx-builder' ) . '</p><div class="auvyx-checks">';
		foreach ( $modes as $mode => $label ) {
			printf( '<label class="auvyx-check"><input type="radio" name="%1$s[mode]" value="%2$s" %3$s><span>%4$s</span></label>', esc_attr( $name ), esc_attr( $mode ), checked( $s['mode'], $mode, false ), esc_html( $label ) );
		}
		echo '</div><table class="form-table" role="presentation"><tr><th scope="row"><label for="auvyx-site-mode-page">' . esc_html__( 'Page to show', 'auvyx-builder' ) . '</label></th><td>';
		wp_dropdown_pages(
			array(
				'name'              => esc_attr( $name ) . '[page]',
				'id'                => 'auvyx-site-mode-page',
				'selected'          => (int) $s['page'],
				'show_option_none'  => esc_html__( 'A simple screen with the message below', 'auvyx-builder' ),
				'option_none_value' => '0',
			)
		);
		echo '<p class="description">' . esc_html__( 'Design it like any page with Auvyx; the theme header and footer are left out.', 'auvyx-builder' ) . '</p></td></tr>';
		printf(
			'<tr><th scope="row"><label for="auvyx-site-mode-message">%1$s</label></th><td><textarea id="auvyx-site-mode-message" name="%2$s[message]" rows="2" class="large-text">%3$s</textarea></td></tr></table></section>',
			esc_html__( 'Message', 'auvyx-builder' ),
			esc_attr( $name ),
			esc_textarea( $s['message'] )
		);
	}
}
