<?php
/**
 * The "Auvyx Builder" admin pages: Pages, Components, Design system, Settings. One shell for all of them (brand bar,
 * tabs, page header, cards); styles in assets/admin.css, loaded on these pages only.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Studio;

use Auvyx\Builder\Modules\Components\Components;
use Auvyx\Builder\Modules\Ai\Ai;
use Auvyx\Builder\Modules\DesignSystem\Brief;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;

defined( 'ABSPATH' ) || exit;

final class Admin {

	/** @var DesignSystem */
	private $design_system;

	/** @var Components */
	private $components;

	/** @var string[] Hook suffixes of our pages (for the stylesheet). */
	private $hooks = array();

	public function __construct( DesignSystem $design_system, Components $components ) {
		$this->design_system = $design_system;
		$this->components    = $components;
	}

	/**
	 * Tabs of the shell: slug suffix => [label, capability, callback].
	 *
	 * @return array<string, array{0: string, 1: string, 2: callable}>
	 */
	private function tabs(): array {
		$tabs = array(
			''            => array( __( 'Pages', 'auvyx-builder' ), 'edit_pages', array( $this, 'page_pages' ) ),
			'-components' => array( __( 'Patterns & components', 'auvyx-builder' ), 'edit_posts', array( $this, 'page_components' ) ),
			'-parts'      => array( __( 'Theme Builder', 'auvyx-builder' ), 'edit_theme_options', array( $this, 'page_parts' ) ),
			'-sites'      => array( __( 'Site templates', 'auvyx-builder' ), 'edit_theme_options', array( $this, 'page_sites' ) ),
			'-design'     => array( __( 'Design system', 'auvyx-builder' ), 'edit_theme_options', array( $this, 'page_design' ) ),
			'-settings'   => array( __( 'Settings', 'auvyx-builder' ), 'manage_options', array( $this, 'page_settings' ) ),
		);
		/**
		 * Filters the Auvyx Builder admin tabs. Add-ons (Auvyx Woo) add `'-slug' => [label, capability, callback, intro]`; their
		 * callback prints the page body inside the shared shell.
		 */
		$extra = (array) apply_filters( 'auvyx_builder_admin_tabs', array() );
		foreach ( $extra as $suffix => $tab ) {
			if ( is_string( $suffix ) && 0 === strpos( $suffix, '-' ) && ! isset( $tabs[ $suffix ] ) && is_array( $tab ) && isset( $tab[0], $tab[1], $tab[2] ) && is_callable( $tab[2] ) ) {
				$label           = (string) $tab[0];
				$body            = $tab[2];
				$intro           = (string) ( $tab[3] ?? '' );
				$tabs[ $suffix ] = array(
					$label,
					(string) $tab[1],
					function () use ( $suffix, $label, $body, $intro ) {
						$this->open( $suffix, $label, $intro );
						call_user_func( $body );
						$this->close();
					},
				);
			}
		}
		// Settings stays last.
		$settings = $tabs['-settings'];
		unset( $tabs['-settings'] );
		$tabs['-settings'] = $settings;
		return $tabs;
	}

	public function menu(): void {
		$this->hooks[] = add_menu_page( __( 'Auvyx Builder', 'auvyx-builder' ), __( 'Auvyx Builder', 'auvyx-builder' ), 'edit_pages', Studio::MENU, array( $this, 'page_pages' ), 'dashicons-layout', 58 );
		foreach ( $this->tabs() as $suffix => $tab ) {
			$hook          = (string) add_submenu_page( Studio::MENU, $tab[0], $tab[0], $tab[1], Studio::MENU . $suffix, $tab[2] );
			$this->hooks[] = $hook;
			if ( '-parts' === $suffix ) {
				add_action( 'load-' . $hook, array( $this, 'open_part' ) );
			}
		}
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	/**
	 * @param string $hook Current admin page hook suffix.
	 */
	public function enqueue( $hook ): void {
		if ( in_array( $hook, $this->hooks, true ) ) {
			wp_enqueue_style( 'auvyx-builder-admin', AUVYX_BUILDER_URL . 'assets/admin.css', array(), AUVYX_BUILDER_VERSION );
		}
	}

	// ---- shell -----------------------------------------------------------------------------

	/**
	 * Opens the shell: brand bar with tabs, then the page header (title, intro, actions).
	 *
	 * @param string $current Slug suffix of the current tab.
	 * @param string $title   Page title.
	 * @param string $intro   One-line description.
	 * @param string $actions Already escaped HTML for the header's right side.
	 */
	private function open( string $current, string $title, string $intro = '', string $actions = '' ): void {
		echo '<div class="wrap auvyx-admin"><div class="auvyx-admin__bar"><span class="auvyx-admin__brand"><span class="auvyx-admin__logo" aria-hidden="true"></span>Auvyx Builder<span class="auvyx-admin__version">' . esc_html( AUVYX_BUILDER_VERSION ) . '</span></span><nav class="auvyx-admin__tabs" aria-label="' . esc_attr__( 'Auvyx Builder', 'auvyx-builder' ) . '">';
		foreach ( $this->tabs() as $suffix => $tab ) {
			if ( current_user_can( $tab[1] ) ) {
				printf(
					'<a href="%s" class="auvyx-admin__tab%s"%s>%s</a>',
					esc_url( admin_url( 'admin.php?page=' . Studio::MENU . $suffix ) ),
					$suffix === $current ? ' is-active' : '',
					$suffix === $current ? ' aria-current="page"' : '',
					esc_html( $tab[0] )
				);
			}
		}
		echo '</nav><a class="auvyx-admin__site" href="' . esc_url( home_url( '/' ) ) . '" target="_blank" rel="noopener">' . esc_html__( 'View site', 'auvyx-builder' ) . ' ↗</a></div>';
		echo '<div class="auvyx-admin__body"><div class="auvyx-admin__head"><div><h1>' . esc_html( $title ) . '</h1>';
		if ( '' !== $intro ) {
			echo '<p class="auvyx-admin__intro">' . esc_html( $intro ) . '</p>';
		}
		echo '</div><div class="auvyx-admin__actions">' . $actions . '</div></div><hr class="wp-header-end">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from escaped parts by the callers.
		if ( ! \Auvyx\Builder\Modules\Editor\Editor::available() ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'The Auvyx editor is not built. Run "bun run editor:build" in the monorepo, or install a release zip.', 'auvyx-builder' ) . '</p></div>';
		}
	}

	private function close(): void {
		echo '</div></div>';
	}

	/** A small status label. */
	private static function badge( string $text, string $tone = '' ): string {
		return '<span class="auvyx-badge' . ( '' !== $tone ? ' auvyx-badge--' . esc_attr( $tone ) : '' ) . '">' . esc_html( $text ) . '</span>';
	}

	/** One-field form posting to the current page (create a page / component). */
	private static function create_form( string $nonce, string $field, string $placeholder, string $button ): string {
		return '<form method="post" class="auvyx-create">' . wp_nonce_field( $nonce, '_wpnonce', true, false )
			. '<input type="text" name="' . esc_attr( $field ) . '" placeholder="' . esc_attr( $placeholder ) . '" aria-label="' . esc_attr( $placeholder ) . '">'
			. '<button type="submit" class="button button-primary">' . esc_html( $button ) . '</button></form>';
	}

	/** Redirects to Auvyx Editor after creating a post (headers are already sent on admin pages). */
	private static function open_in_studio( int $id ): void {
		echo '<script>location.href = ' . wp_json_encode( Studio::url( $id ) ) . ';</script>';
	}

	private static function or_default( string $value, string $fallback ): string {
		return '' === $value ? $fallback : $value;
	}

	// ---- pages -----------------------------------------------------------------------------

	public function page_pages(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified below.
		if ( isset( $_POST['auvyx_new_page'] ) && check_admin_referer( 'auvyx-new-page' ) && current_user_can( 'edit_pages' ) ) {
			$id = wp_insert_post(
				array(
					'post_type'   => 'page',
					'post_status' => 'draft',
					'post_title'  => self::or_default( sanitize_text_field( wp_unslash( $_POST['auvyx_new_page'] ) ), __( 'Untitled page', 'auvyx-builder' ) ),
				)
			);
			if ( $id && ! is_wp_error( $id ) ) {
				self::open_in_studio( (int) $id );
				return;
			}
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only search.
		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
		$posts  = get_posts(
			array(
				'post_type'      => Studio::settings()['post_types'],
				'post_status'    => array( 'publish', 'draft', 'pending', 'private', 'future' ),
				'posts_per_page' => 100,
				'orderby'        => 'modified',
				's'              => $search,
			)
		);
		$posts  = array_filter(
			$posts,
			static function ( \WP_Post $post ) {
				return current_user_can( 'edit_post', $post->ID );
			}
		);
		$this->open(
			'',
			__( 'Pages', 'auvyx-builder' ),
			__( 'Everything you can edit with Auvyx, most recently changed first.', 'auvyx-builder' ),
			self::create_form( 'auvyx-new-page', 'auvyx_new_page', __( 'New page title', 'auvyx-builder' ), __( 'Create page', 'auvyx-builder' ) )
		);
		echo '<div class="auvyx-card auvyx-card--flush"><div class="auvyx-card__toolbar"><form method="get" class="auvyx-search"><input type="hidden" name="page" value="' . esc_attr( Studio::MENU ) . '">'
			. '<input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search…', 'auvyx-builder' ) . '" aria-label="' . esc_attr__( 'Search pages', 'auvyx-builder' ) . '"></form>'
			. '<span class="auvyx-muted">' . esc_html( sprintf( /* translators: %d: number of items */ _n( '%d item', '%d items', count( $posts ), 'auvyx-builder' ), count( $posts ) ) ) . '</span></div>';
		if ( ! $posts ) {
			echo '<div class="auvyx-empty"><strong>' . esc_html( '' !== $search ? __( 'Nothing found', 'auvyx-builder' ) : __( 'No pages yet', 'auvyx-builder' ) ) . '</strong><p>' . esc_html__( 'Create a page above; it opens in the editor.', 'auvyx-builder' ) . '</p></div></div>';
			$this->close();
			return;
		}
		$tones = array(
			'publish' => 'green',
			'future'  => 'blue',
			'pending' => 'amber',
			'private' => 'violet',
		);
		echo '<table class="auvyx-table"><thead><tr><th>' . esc_html__( 'Title', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Status', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Modified', 'auvyx-builder' ) . '</th><th><span class="screen-reader-text">' . esc_html__( 'Actions', 'auvyx-builder' ) . '</span></th></tr></thead><tbody>';
		foreach ( $posts as $post ) {
			$status = get_post_status_object( $post->post_status );
			$view   = 'publish' === $post->post_status ? get_permalink( $post ) : get_preview_post_link( $post );
			printf(
				'<tr><td><a class="auvyx-table__title" href="%1$s">%2$s</a><span class="auvyx-muted">%3$s</span></td><td>%4$s</td><td class="auvyx-muted">%5$s</td><td class="auvyx-table__actions"><a href="%7$s">%8$s</a><a href="%9$s" target="_blank" rel="noopener">%10$s</a><a class="button button-small" href="%1$s">%6$s</a></td></tr>',
				esc_url( Studio::url( $post->ID ) ),
				esc_html( self::or_default( get_the_title( $post ), __( '(no title)', 'auvyx-builder' ) ) ),
				esc_html( (string) get_post_type_object( $post->post_type )->labels->singular_name ),
				self::badge( $status ? (string) $status->label : $post->post_status, $tones[ $post->post_status ] ?? '' ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in badge().
				esc_html( sprintf( /* translators: %s: time span, e.g. "2 hours" */ __( '%s ago', 'auvyx-builder' ), human_time_diff( (int) get_post_modified_time( 'U', true, $post ), time() ) ) ),
				esc_html__( 'Edit with Auvyx', 'auvyx-builder' ),
				esc_url( (string) get_edit_post_link( $post->ID ) ),
				esc_html__( 'Block editor', 'auvyx-builder' ),
				esc_url( (string) $view ),
				esc_html__( 'View', 'auvyx-builder' )
			);
		}
		echo '</tbody></table></div>';
		$this->close();
	}

	public function page_components(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified below.
		$caps = get_post_type_object( 'wp_block' )->cap;
		if ( isset( $_POST['auvyx_new_component'] ) && check_admin_referer( 'auvyx-new-component' ) && current_user_can( $caps->create_posts ) ) {
			$pattern = isset( $_POST['auvyx_new_kind'] ) && 'pattern' === sanitize_key( wp_unslash( $_POST['auvyx_new_kind'] ) );
			$id      = Library::create( sanitize_text_field( wp_unslash( $_POST['auvyx_new_component'] ) ), '', ! $pattern );
			if ( $id && ! is_wp_error( $id ) ) {
				self::open_in_studio( (int) $id );
				return;
			}
		}
		$saved_locations = $this->save_locations();
		$locations       = $this->components->location_options();
		$components      = $this->components->all_for_builder();
		$this->open(
			'-components',
			__( 'Patterns & components', 'auvyx-builder' ),
			__( 'A pattern is a starting point: inserting it copies it, and the copy is edited on its own. A component is one shared piece: change it once and every page that shows it changes. Both are WordPress patterns (synced or not).', 'auvyx-builder' ),
			str_replace(
				'<button type="submit"',
				'<select name="auvyx_new_kind" aria-label="' . esc_attr__( 'Kind', 'auvyx-builder' ) . '"><option value="pattern">' . esc_html__( 'Pattern', 'auvyx-builder' ) . '</option><option value="component">' . esc_html__( 'Component', 'auvyx-builder' ) . '</option></select><button type="submit"',
				self::create_form( 'auvyx-new-component', 'auvyx_new_component', __( 'Name', 'auvyx-builder' ), __( 'Create', 'auvyx-builder' ) )
			)
		);
		if ( '' !== $saved_locations ) {
			echo '<div class="notice notice-success inline"><p>' . esc_html( $saved_locations ) . '</p></div>';
		}
		echo '<div class="auvyx-card auvyx-card--flush">';
		if ( ! $components ) {
			echo '<div class="auvyx-empty"><strong>' . esc_html__( 'No patterns or components yet', 'auvyx-builder' ) . '</strong><p>' . esc_html__( 'Create one above, or right-click a section in the Auvyx editor and choose "Save as pattern" or "Save as component".', 'auvyx-builder' ) . '</p></div></div>';
			$this->close();
			return;
		}
		echo '<table class="auvyx-table"><thead><tr><th>' . esc_html__( 'Name', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Kind', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Shown on the site', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Shortcode', 'auvyx-builder' ) . '</th><th><span class="screen-reader-text">' . esc_html__( 'Actions', 'auvyx-builder' ) . '</span></th></tr></thead><tbody>';
		foreach ( $components as $component ) {
			// Headers and footers are the Theme Builder's (its own screen), as in Elementor.
			if ( '' !== \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::type_of( (int) $component['id'] ) ) {
				continue;
			}
			$where = '';
			foreach ( $this->components->sanitize_locations( (array) $component['locations'] ) as $location ) {
				$where .= self::badge( $this->components->describe( $location ), 'blue' ) . ' ';
			}
			if ( Library::synced( (int) $component['id'] ) && current_user_can( 'edit_theme_options' ) ) {
				$where .= $this->locations_form( (int) $component['id'], $this->components->sanitize_locations( (array) $component['locations'] ), $locations );
			}
			printf(
				'<tr><td><a class="auvyx-table__title" href="%1$s">%2$s</a>%7$s</td><td>%6$s</td><td>%3$s</td><td><code>[auvyx_component id="%4$d"]</code></td><td class="auvyx-table__actions"><a class="button button-small" href="%1$s">%5$s</a></td></tr>',
				esc_url( Studio::url( $component['id'] ) ),
				esc_html( self::or_default( $component['title'], __( '(untitled)', 'auvyx-builder' ) ) ),
				'' !== $where ? $where : '<span class="auvyx-muted">' . esc_html__( 'Only where inserted', 'auvyx-builder' ) . '</span>', // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in badge().
				(int) $component['id'],
				esc_html__( 'Edit with Auvyx', 'auvyx-builder' ),
				Library::synced( (int) $component['id'] ) ? self::badge( __( 'Component', 'auvyx-builder' ), 'blue' ) : self::badge( __( 'Pattern', 'auvyx-builder' ), 'gray' ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in badge().
				self::usage( (int) $component['id'] ) // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in usage().
			);
		}
		echo '</tbody></table></div>';
		$this->close();
	}

	/** "Inserted in 3 pages" under a component's name: how far a change to it reaches. */
	private static function usage( int $id ): string {
		if ( ! Library::synced( $id ) ) {
			return '';
		}
		$pages = count( \Auvyx\Builder\Modules\Components\Components::inserted_in( $id ) );
		/* translators: %d: number of pages */
		$text = $pages ? sprintf( _n( 'Inserted in %d page', 'Inserted in %d pages', $pages, 'auvyx-builder' ), $pages ) : __( 'Not inserted in any page', 'auvyx-builder' );
		return '<span class="auvyx-usage">' . esc_html( $text ) . '</span>';
	}

	/**
	 * Saves a component's display rules from its "Where it shows" form. Returns the notice to show, or "".
	 */
	private function save_locations(): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified below.
		$id = isset( $_POST['auvyx_locations_for'] ) ? absint( $_POST['auvyx_locations_for'] ) : 0;
		if ( ! $id || ! current_user_can( 'edit_theme_options' ) || 'wp_block' !== get_post_type( $id ) ) {
			return '';
		}
		check_admin_referer( 'auvyx-locations-' . $id );
		$rows = isset( $_POST['auvyx_locations'] ) && is_array( $_POST['auvyx_locations'] ) ? wp_unslash( $_POST['auvyx_locations'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- every value goes through Components::sanitize_locations().
		$old  = $this->components->sanitize_locations( get_post_meta( $id, \Auvyx\Builder\Modules\Components\Components::META, true ) );
		$keep = array();
		foreach ( $rows as $i => $row ) {
			if ( ! is_array( $row ) || ! empty( $row['remove'] ) || empty( $row['location'] ) ) {
				continue;
			}
			// Ticked boxes post arrays (an older form posted comma-separated text: both are read).
			$row['postTypes'] = is_array( $row['postTypes'] ?? null ) ? $row['postTypes'] : array_filter( array_map( 'trim', explode( ',', (string) ( $row['postTypes'] ?? '' ) ) ) );
			$row['ids']       = is_array( $row['ids'] ?? null ) ? $row['ids'] : (string) ( $row['ids'] ?? '' );
			// Rules this screen did not show (Auvyx Builder Pro's, while it is not active or licensed) stay as they were; Pro's
			// fields mark the row (`pro`) when they were there, so emptying one of them empties it.
			$keep[] = empty( $row['pro'] ) && is_int( $i ) && isset( $old[ $i ] ) ? $row + $old[ $i ] : $row;
		}
		update_post_meta( $id, \Auvyx\Builder\Modules\Components\Components::META, $this->components->sanitize_locations( $keep ) );
		/* translators: %s: component name */
		return sprintf( __( 'Saved where "%s" shows.', 'auvyx-builder' ), get_the_title( $id ) );
	}

	/**
	 * A component's display rules as sentences: "Show it [under the header] on [every page]", one per place, plus an empty
	 * one to add a place. The pages a rule picks are chosen by title (Auvyx Builder::page_picker), never typed as ids.
	 *
	 * @param array<int, array<string, mixed>> $rows      Saved locations.
	 * @param array<string, string>            $positions Location id → label.
	 */
	private function locations_form( int $id, array $rows, array $positions ): string {
		$rows[] = array(
			'location'  => '',
			'rule'      => 'all',
			'postTypes' => array(),
			'ids'       => array(),
			'terms'     => array(),
			'exclude'   => array(),
			'audience'  => 'all',
			'roles'     => array(),
			'from'      => '',
			'until'     => '',
		);
		$select = static function ( string $name, array $options, $current, string $label ): string {
			$out = '<select name="' . esc_attr( $name ) . '" aria-label="' . esc_attr( $label ) . '">';
			foreach ( $options as $value => $text ) {
				$out .= '<option value="' . esc_attr( (string) $value ) . '"' . selected( (string) $value, (string) $current, false ) . '>' . esc_html( (string) $text ) . '</option>';
			}
			return $out . '</select>';
		};
		$types  = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $type ) {
			if ( 'attachment' !== $type->name ) {
				$types[ $type->name ] = $type->labels->name;
			}
		}
		$html = '<details class="auvyx-locations"><summary>' . esc_html__( 'Where it shows…', 'auvyx-builder' ) . '</summary><form method="post" class="auvyx-locations__form">'
			. wp_nonce_field( 'auvyx-locations-' . $id, '_wpnonce', true, false ) . '<input type="hidden" name="auvyx_locations_for" value="' . esc_attr( (string) $id ) . '">';
		foreach ( $rows as $i => $row ) {
			$n          = 'auvyx_locations[' . $i . ']';
			$new        = '' === $row['location'];
			$types_html = '';
			foreach ( $types as $type => $label ) {
				$types_html .= '<label class="auvyx-check"><input type="checkbox" name="' . esc_attr( $n ) . '[postTypes][]" value="' . esc_attr( $type ) . '"' . checked( in_array( $type, (array) $row['postTypes'], true ), true, false ) . '> ' . esc_html( $label ) . '</label>';
			}
			$html .= '<fieldset class="auvyx-where' . ( $new ? ' auvyx-where--new' : '' ) . '"><legend>' . ( $new ? esc_html__( 'Show it somewhere else', 'auvyx-builder' ) : esc_html( $this->components->describe( $row ) ) ) . '</legend>'
				. '<p class="auvyx-where__sentence">' . esc_html__( 'Show it', 'auvyx-builder' ) . ' '
				. $select( $n . '[location]', ( $new ? array( '' => __( 'choose a place…', 'auvyx-builder' ) ) : array() ) + $positions, $row['location'], __( 'Where', 'auvyx-builder' ) )
				. ' ' . esc_html__( 'on', 'auvyx-builder' ) . ' '
				. $select( $n . '[rule]', \Auvyx\Builder\Modules\Components\Components::rule_labels(), $row['rule'], __( 'On which pages', 'auvyx-builder' ) )
				. '</p>'
				. '<div class="auvyx-where__when auvyx-where__when--singular"><span>' . esc_html__( 'Of these kinds', 'auvyx-builder' ) . '</span><div class="auvyx-check-row">' . $types_html . '</div></div>'
				. '<div class="auvyx-where__when auvyx-where__when--ids"><span>' . esc_html__( 'These pages', 'auvyx-builder' ) . '</span>' . self::page_picker( $n . '[ids]', (array) $row['ids'] ) . '</div>'
				. self::more_conditions( $n, $row )
				. ( $new ? '' : '<label class="auvyx-where__remove"><input type="checkbox" name="' . esc_attr( $n ) . '[remove]" value="1"> ' . esc_html__( 'Stop showing it here', 'auvyx-builder' ) . '</label>' )
				. '</fieldset>';
		}
		if ( \Auvyx\Builder\Modules\Edition\Edition::pro() && ! \Auvyx\Builder\Modules\Edition\Edition::licensed() ) {
			$html .= '<p class="auvyx-muted">' . sprintf(
				/* translators: %s: link to Auvyx Builder Pro */
				esc_html__( 'Archives, categories, search, 404, pages left out, who sees it and dates: %s', 'auvyx-builder' ),
				'<a href="' . esc_url( admin_url( 'admin.php?page=' . Studio::MENU . \Auvyx\Builder\Modules\Edition\Edition::TAB ) ) . '">' . esc_html__( 'Auvyx Builder Pro', 'auvyx-builder' ) . '</a>'
			) . '</p>';
		}
		return $html . '<p><button type="submit" class="button button-primary">' . esc_html__( 'Save', 'auvyx-builder' ) . '</button></p></form></details>';
	}

	/**
	 * Pages and posts to tick by title, with a filter box: what a rule like "the pages I pick" needs. Public, so Auvyx
	 * Builder Pro's "never on" uses the same picker.
	 *
	 * @param string $name     Field name; the values post as `{$name}[]`.
	 * @param int[]  $selected Ticked ids.
	 */
	public static function page_picker( string $name, array $selected ): string {
		$selected = array_map( 'intval', $selected );
		$types    = array_values( array_diff( get_post_types( array( 'public' => true ) ), array( 'attachment' ) ) );
		$posts    = get_posts(
			array(
				'post_type'      => $types,
				'post_status'    => array( 'publish', 'draft', 'private', 'future' ),
				'posts_per_page' => 300, // phpcs:ignore WordPress.WP.PostsPerPage -- one admin picker; titles only.
				'orderby'        => array(
					'post_type' => 'ASC',
					'title'     => 'ASC',
				),
			)
		);
		// Ticked ones first, so what is chosen is seen without scrolling.
		usort(
			$posts,
			static function ( \WP_Post $a, \WP_Post $b ) use ( $selected ): int {
				return (int) in_array( $b->ID, $selected, true ) - (int) in_array( $a->ID, $selected, true );
			}
		);
		$items = '';
		foreach ( $posts as $post ) {
			$type   = get_post_type_object( $post->post_type );
			$items .= '<label class="auvyx-check" data-title="' . esc_attr( strtolower( get_the_title( $post ) ) ) . '"><input type="checkbox" name="' . esc_attr( $name ) . '[]" value="' . esc_attr( (string) $post->ID ) . '"' . checked( in_array( $post->ID, $selected, true ), true, false ) . '> '
				. esc_html( '' !== get_the_title( $post ) ? get_the_title( $post ) : __( '(untitled)', 'auvyx-builder' ) ) . ' <span class="auvyx-muted">' . esc_html( $type ? $type->labels->singular_name : $post->post_type ) . '</span></label>';
		}
		return '<div class="auvyx-picker"><input type="search" class="auvyx-picker__filter" placeholder="' . esc_attr__( 'Find a page…', 'auvyx-builder' ) . '" aria-label="' . esc_attr__( 'Find a page', 'auvyx-builder' ) . '"'
			. ' oninput="var q=this.value.toLowerCase();this.nextElementSibling.querySelectorAll(\'[data-title]\').forEach(function(l){l.hidden=q!==\'\'&&l.dataset.title.indexOf(q)<0;});">'
			. '<div class="auvyx-picker__list">' . ( '' !== $items ? $items : '<span class="auvyx-muted">' . esc_html__( 'No pages yet.', 'auvyx-builder' ) . '</span>' ) . '</div></div>';
	}

	/**
	 * Auvyx Builder Pro's conditions of one place (who, when, pages left out), folded under "More conditions".
	 *
	 * @param string               $name Field name prefix (`auvyx_locations[0]`).
	 * @param array<string, mixed> $row  The location.
	 */
	private static function more_conditions( string $name, array $row ): string {
		$fields = self::location_fields( $name, $row );
		if ( '' === $fields ) {
			return '';
		}
		$open = \Auvyx\Builder\Modules\Components\Components::advanced( $row );
		return '<details class="auvyx-where__more"' . ( $open ? ' open' : '' ) . '><summary>' . esc_html__( 'More conditions', 'auvyx-builder' ) . '</summary><div class="auvyx-where__fields">' . $fields . '</div></details>';
	}

	/**
	 * More fields of one location, from Auvyx Builder Pro (its display rules).
	 *
	 * @param string               $name Field name prefix (`auvyx_locations[0]`).
	 * @param array<string, mixed> $row  The location.
	 */
	private static function location_fields( string $name, array $row ): string {
		/**
		 * Fields Auvyx Builder Pro adds to a location (escaped HTML; inputs named `{$name}[key]`).
		 *
		 * @param string $html Fields so far.
		 * @param string $name Field name prefix.
		 * @param array  $row  The location.
		 */
		return (string) apply_filters( 'auvyx_builder_location_fields', '', $name, $row );
	}

	/** "Edit in Studio" on a part: make sure it has a database copy, then open it (before any output). */
	public function open_part(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified below.
		if ( ! isset( $_GET['part'] ) || ! current_user_can( 'edit_theme_options' ) ) {
			return;
		}
		check_admin_referer( 'auvyx-edit-part' );
		$id      = sanitize_text_field( wp_unslash( $_GET['part'] ) );
		$post_id = Parts::ensure_post( $id );
		if ( ! $post_id ) {
			wp_die( esc_html__( 'This template part does not exist.', 'auvyx-builder' ) );
		}
		// The part opens in Auvyx Editor (parts.ts still adds `editor=1`, from when the Studio was a choice).
		$url = \Auvyx\Builder\Modules\Editor\Editor::url( $post_id );
		// The page it was opened from keeps its way back: without it the part's Back leaves for wp-admin
		// (parts.ts `backFrom`, the editor's own `auvyx-back`).
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified above.
		$back = isset( $_GET['auvyx-back'] ) ? esc_url_raw( wp_unslash( $_GET['auvyx-back'] ) ) : '';
		if ( '' !== $back ) {
			// build_query() does not encode values, and the way back has its own `?` and `&`: encode once here.
			$url = add_query_arg(
				array(
					'auvyx-back'       => rawurlencode( $back ),
					// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified above.
					'auvyx-back-title' => rawurlencode( isset( $_GET['auvyx-back-title'] ) ? sanitize_text_field( wp_unslash( $_GET['auvyx-back-title'] ) ) : '' ),
				),
				$url
			);
		}
		wp_safe_redirect( $url );
		exit;
	}

	/**
	 * Site templates: a whole site in one file (docs/site-templates.md), outside the page editor so applying one is
	 * never mistaken for changing a page. The Studio draws the screen (`view=sites`): it reads, checks and applies
	 * templates the same way on EzyPlatform. It needs a page to start from; nothing on that page changes.
	 */
	/**
	 * A page the Studio can open on for screens about the whole site (Site templates, Add New Header): the front page,
	 * else the first page, else a new draft "Home". Nothing on it changes.
	 */
	private static function studio_host(): int {
		$front = 'page' === get_option( 'show_on_front' ) ? (int) get_option( 'page_on_front' ) : 0;
		$host  = $front && current_user_can( 'edit_post', $front ) ? $front : 0;
		if ( ! $host ) {
			$pages = get_posts(
				array(
					'post_type'      => 'page',
					'post_status'    => array( 'publish', 'draft' ),
					'posts_per_page' => 1,
					'fields'         => 'ids',
				)
			);
			$host  = $pages ? (int) $pages[0] : 0;
		}
		if ( ! $host ) {
			$host = (int) wp_insert_post(
				array(
					'post_type'   => 'page',
					'post_status' => 'draft',
					'post_title'  => __( 'Home', 'auvyx-builder' ),
				)
			);
		}
		return $host;
	}

	public function page_sites(): void {
		$this->open( '-sites', __( 'Site templates', 'auvyx-builder' ), __( 'Start a whole site from a demo: its pages, menus, header, footer and colors. To change a single page, open it with Auvyx and choose Page templates.', 'auvyx-builder' ) );
		$host = self::studio_host();
		// Auvyx Editor draws the screen (Studio::url leads there; apps/editor/src/screens).
		if ( ! \Auvyx\Builder\Modules\Editor\Editor::available() || ! $host ) {
			echo '<section class="auvyx-card"><p class="auvyx-muted">' . esc_html__( 'The Auvyx editor is not available.', 'auvyx-builder' ) . '</p></section>';
			$this->close();
			return;
		}
		printf(
			'<iframe class="auvyx-sites-frame" title="%s" src="%s"></iframe>',
			esc_attr__( 'Site templates', 'auvyx-builder' ),
			esc_url( add_query_arg( 'view', 'sites', Studio::url( $host ) ) )
		);
		$this->close();
	}

	/**
	 * The Theme Builder, as Elementor's: the site's headers and footers as cards (a live preview, where each shows, a
	 * green dot when it has display conditions), "Add New Header", and the theme's own parts underneath, which show
	 * wherever none of the site's templates claims the page.
	 */
	public function page_parts(): void {
		$this->open( '-parts', __( 'Theme Builder', 'auvyx-builder' ), __( 'Your site’s header and footer. Each one shows where its display conditions say; where none of yours does, the theme’s own shows.', 'auvyx-builder' ) );
		if ( ! Parts::supported() ) {
			printf(
				'<section class="auvyx-card"><h2>%s</h2><p class="auvyx-muted">%s</p><a class="button" href="%s">%s</a></section>',
				esc_html__( 'Your theme uses PHP templates', 'auvyx-builder' ),
				esc_html__( 'The Theme Builder needs a block theme (like Auvyx Theme). With this theme, build a component and show it "under the header" or "above the footer".', 'auvyx-builder' ),
				esc_url( admin_url( 'admin.php?page=' . Studio::MENU . '-components' ) ),
				esc_html__( 'Go to Components', 'auvyx-builder' )
			);
			$this->close();
			return;
		}
		$this->trash_part();
		$host = self::studio_host();
		foreach ( \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::TYPES as $type ) {
			$this->builder_section( $type, $host );
		}
		$this->theme_parts();
		$this->close();
	}

	/** "Delete" on a card: the template goes to the trash (Patterns can restore it). */
	private function trash_part(): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified below.
		$id = isset( $_GET['auvyx_trash_part'] ) ? absint( $_GET['auvyx_trash_part'] ) : 0;
		if ( ! $id || '' === \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder::type_of( $id ) || ! current_user_can( 'delete_post', $id ) ) {
			return;
		}
		check_admin_referer( 'auvyx-trash-part-' . $id );
		$title = get_the_title( $id );
		if ( wp_trash_post( $id ) ) {
			/* translators: %s: template name */
			echo '<div class="notice notice-success inline"><p>' . esc_html( sprintf( __( '“%s” was moved to the trash.', 'auvyx-builder' ), $title ) ) . '</p></div>';
		}
	}

	/**
	 * One kind of template (Header or Footer): its cards and "Add New".
	 *
	 * @param string $type `header` or `footer`.
	 * @param int    $host The page the Studio opens on to start a new one.
	 */
	private function builder_section( string $type, int $host ): void {
		$tb    = '\Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder';
		$label = 'footer' === $type ? __( 'Footer', 'auvyx-builder' ) : __( 'Header', 'auvyx-builder' );
		/* translators: %s: Header or Footer */
		$add  = sprintf( __( 'Add New %s', 'auvyx-builder' ), $label );
		$new  = $host ? add_query_arg(
			array(
				'view' => 'new-part',
				'type' => $type,
			),
			Studio::url( $host )
		) : '';
		$home = home_url( '/' );
		echo '<section class="auvyx-tb" data-auvyx-tb="' . esc_attr( $type ) . '"><div class="auvyx-tb__head"><h2>' . esc_html( $label ) . '</h2>'
			. ( '' !== $new ? '<a class="button button-primary" data-auvyx-tb-new="' . esc_attr( $type ) . '" href="' . esc_url( $new ) . '">' . esc_html( $add ) . '</a>' : '' ) . '</div><div class="auvyx-tb__grid">';
		$ids = $tb::of_type( $type );
		foreach ( $ids as $id ) {
			$summary   = $tb::describe( $tb::all()[ $id ]['conditions'] );
			$conflicts = $tb::conflicts( $id );
			$preview   = add_query_arg( $tb::PREVIEW . $type, (string) $id, $home );
			printf(
				'<article class="auvyx-tb__card" data-auvyx-tb-card="%1$d"><div class="auvyx-tb__shot auvyx-tb__shot--%2$s"><iframe src="%3$s" loading="lazy" tabindex="-1" aria-hidden="true" title="%4$s"%5$s></iframe></div>'
				. '<div class="auvyx-tb__body"><strong>%4$s</strong><span class="auvyx-tb__status %6$s"><i aria-hidden="true"></i>%7$s</span>%8$s'
				. '<span class="auvyx-tb__actions"><a class="button button-small" href="%9$s">%10$s</a><a class="button button-small" href="%11$s">%12$s</a><a class="auvyx-tb__delete" href="%13$s" onclick="return confirm(this.dataset.confirm)" data-confirm="%14$s">%15$s</a></span></div></article>',
				(int) $id,
				esc_attr( $type ),
				esc_url( $preview ),
				esc_attr( get_the_title( $id ) ),
				'footer' === $type ? ' onload="try{this.contentWindow.scrollTo(0,1e6)}catch(e){}"' : '',
				'' !== $summary ? 'is-on' : 'is-off',
				'' !== $summary ? esc_html( $summary ) : esc_html__( 'No display conditions: not shown yet', 'auvyx-builder' ),
				$conflicts ? '<span class="auvyx-tb__conflict">' . esc_html(
					/* translators: %s: other templates */
					sprintf( __( 'Also set for the same pages: %s. The newest one shows.', 'auvyx-builder' ), implode( ', ', $conflicts ) )
				) . '</span>' : '',
				esc_url( Studio::url( $id ) ),
				esc_html__( 'Edit', 'auvyx-builder' ),
				esc_url( add_query_arg( 'auvyx-conditions', '1', Studio::url( $id ) ) ),
				esc_html__( 'Edit Conditions', 'auvyx-builder' ),
				esc_url( wp_nonce_url( admin_url( 'admin.php?page=' . Studio::MENU . '-parts&auvyx_trash_part=' . $id ), 'auvyx-trash-part-' . $id ) ),
				/* translators: %s: template name */
				esc_attr( sprintf( __( 'Move “%s” to the trash? Where it showed, the theme’s own shows again.', 'auvyx-builder' ), get_the_title( $id ) ) ),
				esc_html__( 'Delete', 'auvyx-builder' )
			);
		}
		if ( ! $ids ) {
			printf(
				'<div class="auvyx-tb__empty"><div class="auvyx-tb__shot auvyx-tb__shot--%1$s"><iframe src="%2$s" loading="lazy" tabindex="-1" aria-hidden="true" title="%3$s"%4$s></iframe></div><p>%5$s</p>%6$s</div>',
				esc_attr( $type ),
				esc_url( add_query_arg( $tb::PREVIEW . $type, 'theme', $home ) ),
				esc_attr( $label ),
				'footer' === $type ? ' onload="try{this.contentWindow.scrollTo(0,1e6)}catch(e){}"' : '',
				/* translators: %s: header or footer */
				esc_html( sprintf( __( 'No %s of your own yet: the theme’s shows on every page.', 'auvyx-builder' ), strtolower( $label ) ) ),
				'' !== $new ? '<a class="button" href="' . esc_url( $new ) . '">' . esc_html( $add ) . '</a>' : ''
			);
		}
		echo '</div></section>';
	}

	/** The theme's own parts: shown where none of the site's templates claims a page; editable too. */
	private function theme_parts(): void {
		$parts = Parts::all();
		echo '<details class="auvyx-card auvyx-card--flush auvyx-tb__theme"><summary>' . esc_html__( 'The theme’s own parts', 'auvyx-builder' ) . ' <span class="auvyx-muted">' . esc_html__( 'shown wherever none of yours is', 'auvyx-builder' ) . '</span></summary><table class="auvyx-table"><thead><tr><th>' . esc_html__( 'Part', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Area', 'auvyx-builder' ) . '</th><th>' . esc_html__( 'Source', 'auvyx-builder' ) . '</th><th><span class="screen-reader-text">' . esc_html__( 'Actions', 'auvyx-builder' ) . '</span></th></tr></thead><tbody>';
		foreach ( $parts as $part ) {
			$areas = array(
				'header' => __( 'Header', 'auvyx-builder' ),
				'footer' => __( 'Footer', 'auvyx-builder' ),
			);
			printf(
				'<tr><td><a class="auvyx-table__title" href="%1$s">%2$s</a><span class="auvyx-muted">%3$s</span></td><td>%4$s</td><td>%5$s</td><td class="auvyx-table__actions"><a href="%6$s">%7$s</a><a class="button button-small" href="%1$s">%8$s</a></td></tr>',
				esc_url( wp_nonce_url( admin_url( 'admin.php?page=' . Studio::MENU . '-parts&part=' . rawurlencode( $part->id ) ), 'auvyx-edit-part' ) ),
				esc_html( self::or_default( (string) $part->title, $part->slug ) ),
				esc_html( $part->slug ),
				isset( $areas[ $part->area ] ) ? self::badge( $areas[ $part->area ], 'blue' ) : self::badge( __( 'General', 'auvyx-builder' ) ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in badge().
				'custom' === $part->source || $part->wp_id ? self::badge( __( 'Edited', 'auvyx-builder' ), 'green' ) : self::badge( __( 'Theme', 'auvyx-builder' ) ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in badge().
				esc_url( admin_url( 'site-editor.php?p=' . rawurlencode( '/wp_template_part/' . $part->id ) . '&canvas=edit' ) ),
				esc_html__( 'Site Editor', 'auvyx-builder' ),
				esc_html__( 'Edit with Auvyx', 'auvyx-builder' )
			);
		}
		if ( ! $parts ) {
			echo '<tr><td colspan="4" class="auvyx-empty">' . esc_html__( 'This theme has no template parts.', 'auvyx-builder' ) . '</td></tr>';
		}
		echo '</tbody></table></details>';
	}

	/** Design brief forms (POST to the Design system page): save, generate, apply, discard, remove. */
	private function handle_brief(): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified below.
		$action = isset( $_POST['auvyx_brief_action'] ) ? sanitize_key( wp_unslash( $_POST['auvyx_brief_action'] ) ) : '';
		if ( '' === $action || ! current_user_can( 'edit_theme_options' ) ) {
			return '';
		}
		check_admin_referer( 'auvyx-brief' );
		$user = get_current_user_id();
		if ( 'save' === $action || 'generate' === $action ) {
			$markdown = isset( $_POST['auvyx_brief'] ) ? (string) wp_unslash( $_POST['auvyx_brief'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- markdown is stored as text and only ever escaped on output.
			if ( isset( $_FILES['auvyx_brief_file']['tmp_name'] ) && is_uploaded_file( $_FILES['auvyx_brief_file']['tmp_name'] ) && (int) ( $_FILES['auvyx_brief_file']['size'] ?? 0 ) <= 200000 ) { // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
				$markdown = (string) file_get_contents( $_FILES['auvyx_brief_file']['tmp_name'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions, WordPress.Security.ValidatedSanitizedInput
			}
			Brief::save_brief( $markdown );
		}
		if ( 'generate' === $action ) {
			$use_ai = Ai::configured() && ! empty( $_POST['auvyx_brief_ai'] );
			// DESIGN.md tokens are exact: they win; the AI reads prose-only briefs.
			$exact  = Brief::from_brief( Brief::brief() );
			$preset = $exact && ( ! $use_ai || \Auvyx\Builder\Modules\DesignSystem\DesignMd::split( Brief::brief() )['tokens'] ) ? $exact : ( $use_ai ? Brief::from_ai( Brief::brief() ) : $exact );
			if ( is_wp_error( $preset ) ) {
				return $preset->get_error_message();
			}
			if ( array() === $preset ) {
				return __( 'No colors, fonts or radius found. Write them like "Primary: #2563eb" or "Heading font: Inter", or connect the AI assistant.', 'auvyx-builder' );
			}
			update_user_meta( $user, 'auvyx_preset_draft', $preset );
			return '';
		}
		if ( 'apply' === $action ) {
			$draft = get_user_meta( $user, 'auvyx_preset_draft', true );
			if ( is_array( $draft ) ) {
				$problems = Brief::apply( $draft );
				delete_user_meta( $user, 'auvyx_preset_draft' );
				if ( $problems ) {
					return implode( ' ', $problems );
				}
			}
		}
		if ( 'discard' === $action ) {
			delete_user_meta( $user, 'auvyx_preset_draft' );
		}
		if ( 'remove' === $action ) {
			Brief::clear();
		}
		return '';
	}

	/** Swatches and type of a preset. */
	private static function preset_html( array $preset ): string {
		$html = '<div class="auvyx-swatches">';
		foreach ( (array) ( $preset['colors'] ?? array() ) as $key => $color ) {
			$html .= sprintf(
				'<div class="auvyx-swatch"><span class="auvyx-swatch__chip" style="background:%1$s"></span><strong>%2$s</strong><code>%1$s</code></div>',
				esc_attr( $color ),
				esc_html( Brief::COLORS[ $key ][0] ?? $key )
			);
		}
		$html .= '</div><dl class="auvyx-dl" style="margin-top:16px">';
		foreach ( (array) ( $preset['type'] ?? array() ) as $role => $level ) {
			$html .= sprintf( '<dt>%1$s</dt><dd><code>%2$s</code></dd>', esc_html( (string) $role ), esc_html( implode( ' · ', array_map( 'strval', $level ) ) ) );
		}
		foreach ( array(
			__( 'Heading font', 'auvyx-builder' ) => $preset['fonts']['heading'] ?? '—',
			__( 'Body font', 'auvyx-builder' )    => $preset['fonts']['body'] ?? '—',
			__( 'Radius', 'auvyx-builder' )       => $preset['radius'] ?? '—',
			__( 'Buttons', 'auvyx-builder' )      => $preset['buttonRadius'] ?? ( $preset['radius'] ?? '—' ),
		) as $label => $value ) {
			$html .= '<dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( (string) $value ) . '</dd>';
		}
		return $html . '</dl>' . Brief::details_html( $preset ); // Concept (read-only), dark scheme, shadows; escaped there.
	}

	private function brief_card( string $error ): void {
		$draft  = get_user_meta( get_current_user_id(), 'auvyx_preset_draft', true );
		$preset = Brief::preset();
		$form   = static function ( string $action, string $label, string $css = 'button' ): string {
			return '<button type="submit" name="auvyx_brief_action" value="' . esc_attr( $action ) . '" class="' . esc_attr( $css ) . '">' . esc_html( $label ) . '</button>';
		};
		echo '<section class="auvyx-card" id="design-brief"><h2>' . esc_html__( 'Design brief (DESIGN.md)', 'auvyx-builder' ) . '</h2><p class="auvyx-muted">' . esc_html__( 'Paste or upload your brand\'s design document. Auvyx turns it into a preset for the theme, WooCommerce and Auvyx elements, and the AI follows it when it builds pages.', 'auvyx-builder' ) . '</p>';
		if ( '' !== $error ) {
			echo '<div class="notice notice-error inline"><p>' . esc_html( $error ) . '</p></div>';
		}
		echo '<form method="post" enctype="multipart/form-data">';
		wp_nonce_field( 'auvyx-brief' );
		echo '<textarea name="auvyx_brief" rows="10" class="large-text code" placeholder="# Acme&#10;Primary: #0f766e&#10;Heading font: Fraunces&#10;Body font: Inter&#10;Radius: 10px">' . esc_textarea( Brief::brief() ) . '</textarea>';
		echo '<p class="auvyx-brief-actions"><input type="file" name="auvyx_brief_file" accept=".md,.markdown,.txt,text/markdown,text/plain"> ';
		if ( Ai::configured() ) {
			echo '<label><input type="checkbox" name="auvyx_brief_ai" value="1" checked> ' . esc_html__( 'Use the AI assistant', 'auvyx-builder' ) . '</label> ';
		}
		echo $form( 'save', __( 'Save brief', 'auvyx-builder' ) ) . ' ' . $form( 'generate', __( 'Generate preset', 'auvyx-builder' ), 'button button-primary' ) . '</p></form>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in $form.
		if ( is_array( $draft ) && $draft ) {
			echo '<div class="auvyx-preset-draft"><h3>' . esc_html__( 'New preset', 'auvyx-builder' ) . ( '' !== ( $draft['name'] ?? '' ) ? ': ' . esc_html( $draft['name'] ) : '' ) . '</h3>' . self::preset_html( $draft ) . '<form method="post">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in preset_html.
			wp_nonce_field( 'auvyx-brief' );
			echo $form( 'apply', __( 'Apply to the site', 'auvyx-builder' ), 'button button-primary' ) . ' ' . $form( 'discard', __( 'Discard', 'auvyx-builder' ) ) . '</form></div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in $form.
		}
		if ( $preset ) {
			echo '<div class="auvyx-preset-current"><h3>' . esc_html__( 'Applied preset', 'auvyx-builder' ) . ( '' !== ( $preset['name'] ?? '' ) ? ': ' . esc_html( $preset['name'] ) : '' ) . '</h3>' . self::preset_html( $preset ) . '<form method="post">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in preset_html.
			wp_nonce_field( 'auvyx-brief' );
			echo $form( 'remove', __( 'Remove preset (back to the theme)', 'auvyx-builder' ) ) . '</form></div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in $form.
		}
		echo '</section>';
	}

	public function page_design(): void {
		$error = $this->handle_brief();
		$ds    = $this->design_system->for_studio();
		$this->open(
			'-design',
			__( 'Design system', 'auvyx-builder' ),
			__( 'Tokens are added to theme.json, so core blocks and other plugins use them too.', 'auvyx-builder' ),
			'<a class="button" href="' . esc_url( admin_url( 'site-editor.php?p=%2Fstyles' ) ) . '">' . esc_html__( 'Edit in Styles', 'auvyx-builder' ) . '</a>'
		);
		$this->brief_card( $error );
		echo '<section class="auvyx-card"><h2>' . esc_html__( 'Colors', 'auvyx-builder' ) . '</h2><div class="auvyx-swatches">';
		foreach ( $ds['tokens']['color'] as $token ) {
			printf(
				'<div class="auvyx-swatch"><span class="auvyx-swatch__chip" style="background:%1$s"></span><strong>%2$s</strong><code>%3$s</code></div>',
				esc_attr( $token['color'] ),
				esc_html( $token['name'] ),
				esc_html( $token['color'] )
			);
		}
		echo '</div></section><div class="auvyx-grid"><section class="auvyx-card"><h2>' . esc_html__( 'Type scale', 'auvyx-builder' ) . '</h2><ul class="auvyx-list">';
		foreach ( $ds['tokens']['fontSize'] as $token ) {
			printf(
				'<li><span class="auvyx-type" style="font-size:min(%1$s, 40px)">Aa</span><span>%2$s</span><code>%3$s</code></li>',
				esc_attr( $token['size'] ),
				esc_html( $token['name'] ),
				esc_html( $token['size'] )
			);
		}
		echo '</ul></section><section class="auvyx-card"><h2>' . esc_html__( 'Spacing', 'auvyx-builder' ) . '</h2><ul class="auvyx-list">';
		foreach ( $ds['tokens']['spacing'] as $token ) {
			printf(
				'<li><span class="auvyx-space"><span style="width:min(%1$s, 120px)"></span></span><span>%2$s</span><code>%3$s</code></li>',
				esc_attr( $token['size'] ),
				esc_html( $token['name'] ),
				esc_html( $token['size'] )
			);
		}
		echo '</ul></section></div><section class="auvyx-card"><h2>' . esc_html__( 'Breakpoints', 'auvyx-builder' ) . '</h2><ul class="auvyx-list">';
		foreach ( $ds['breakpoints'] as $bp ) {
			$range = isset( $bp['maxWidth'] ) ? '≤ ' . $bp['maxWidth'] . 'px' : ( isset( $bp['minWidth'] ) ? '≥ ' . $bp['minWidth'] . 'px' : __( 'Base (desktop)', 'auvyx-builder' ) );
			printf( '<li><span>%s</span><code>%s</code></li>', esc_html( $bp['label'] ), esc_html( $range ) );
		}
		echo '</ul></section>';
		$this->close();
	}

	public function page_settings(): void {
		$enabled = Studio::settings()['post_types'];
		$this->open( '-settings', __( 'Settings', 'auvyx-builder' ), __( 'What the builder edits and how its assistant connects.', 'auvyx-builder' ) );
		/** Fires first on Settings: the optional Auvyx Cloud account that holds a licence key (License); Auvyx Builder Pro's licence has its own tab. */
		do_action( 'auvyx_builder_settings_account' );
		settings_errors();
		echo '<form method="post" action="options.php" class="auvyx-settings">';
		settings_fields( Studio::MENU );
		echo '<section class="auvyx-card"><h2>' . esc_html__( 'Editing', 'auvyx-builder' ) . '</h2><p class="auvyx-muted">' . esc_html__( 'Content types that open with Auvyx. Components (synced patterns) always do.', 'auvyx-builder' ) . '</p><div class="auvyx-checks">';
		foreach ( get_post_types( array( 'show_ui' => true ), 'objects' ) as $type ) {
			if ( in_array( $type->name, array( 'attachment', 'wp_block', 'wp_navigation', 'wp_template', 'wp_template_part' ), true ) || ! post_type_supports( $type->name, 'editor' ) ) {
				continue;
			}
			printf(
				'<label class="auvyx-check"><input type="checkbox" name="%1$s[post_types][]" value="%2$s" %3$s><span><strong>%4$s</strong><code>%2$s</code></span></label>',
				esc_attr( Studio::SETTINGS ),
				esc_attr( $type->name ),
				checked( in_array( $type->name, $enabled, true ), true, false ),
				esc_html( $type->labels->name )
			);
		}
		echo '</div></section>';
		/** Fires inside the settings form (same option group): modules add their own cards (`section.auvyx-card`). */
		do_action( 'auvyx_builder_settings_fields' );
		echo '<div class="auvyx-savebar">';
		submit_button( __( 'Save settings', 'auvyx-builder' ), 'primary', 'submit', false );
		echo '</div></form>';
		/** Fires after the settings form: cards with their own forms (License). */
		do_action( 'auvyx_builder_settings_after' );
		$this->system_card();
		$this->close();
	}

	/** Versions and integrations, for support requests. */
	private function system_card(): void {
		global $wp_version;
		$rows = array(
			__( 'Auvyx Builder', 'auvyx-builder' ) => AUVYX_BUILDER_VERSION,
			__( 'Auvyx Editor', 'auvyx-builder' )  => \Auvyx\Builder\Modules\Editor\Editor::available() ? __( 'Installed', 'auvyx-builder' ) : __( 'Not built', 'auvyx-builder' ),
			__( 'WordPress', 'auvyx-builder' )     => (string) $wp_version . ( is_multisite() ? ' (multisite)' : '' ),
			__( 'PHP', 'auvyx-builder' )           => PHP_VERSION,
			__( 'Theme', 'auvyx-builder' )         => (string) wp_get_theme()->get( 'Name' ) . ( wp_is_block_theme() ? ' (block theme)' : '' ),
			__( 'WooCommerce', 'auvyx-builder' )   => class_exists( 'WooCommerce' ) && defined( 'WC_VERSION' ) ? (string) WC_VERSION : __( 'Not active', 'auvyx-builder' ),
		);
		echo '<section class="auvyx-card"><h2>' . esc_html__( 'System', 'auvyx-builder' ) . '</h2><dl class="auvyx-dl">';
		foreach ( $rows as $label => $value ) {
			printf( '<dt>%s</dt><dd>%s</dd>', esc_html( $label ), esc_html( $value ) );
		}
		echo '</dl></section>';
	}
}
